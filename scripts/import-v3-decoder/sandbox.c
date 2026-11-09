#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/landlock.h>
#include <linux/seccomp.h>
#include <signal.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif
#ifndef __NR_fchmodat2
#define __NR_fchmodat2 452
#endif

#define READ_DIR (LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR)
#define EXEC_FILE (LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_EXECUTE)
#define SCRATCH (READ_DIR | LANDLOCK_ACCESS_FS_WRITE_FILE | LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_REMOVE_FILE | LANDLOCK_ACCESS_FS_TRUNCATE)
#if defined(__x86_64__)
#define SANDBOX_ARCH AUDIT_ARCH_X86_64
#define SANDBOX_LIB "/usr/lib/x86_64-linux-gnu"
#define SANDBOX_LINKER "/lib64/ld-linux-x86-64.so.2"
#elif defined(__aarch64__)
#define SANDBOX_ARCH AUDIT_ARCH_AARCH64
#define SANDBOX_LIB "/usr/lib/aarch64-linux-gnu"
#define SANDBOX_LINKER "/lib/ld-linux-aarch64.so.1"
#else
#error Unsupported decoder architecture
#endif
#define ROOT "/opt/otr/import-v3"
#define NODE "/usr/local/bin/node"
#define DENY(number) \
  BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_##number, 0, 1), \
  BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM)

static void fail(const char *stage) {
  perror(stage);
  exit(2);
}

static void limit(int resource, rlim_t value) {
  const struct rlimit cap = {value, value};
  if (setrlimit(resource, &cap)) fail("DECODER_RESOURCE_LIMIT");
}

static void allow_path(int rules, const char *path, uint64_t access) {
  int fd = open(path, O_PATH | O_CLOEXEC);
  if (fd < 0) fail("DECODER_PATH");
  const struct landlock_path_beneath_attr rule = {
    .allowed_access = access, .parent_fd = fd,
  };
  if (syscall(SYS_landlock_add_rule, rules, LANDLOCK_RULE_PATH_BENEATH, &rule, 0))
    fail("DECODER_LANDLOCK_RULE");
  close(fd);
}

int main(int argc, char **argv) {
  if (argc < 5 || getuid() == 0) return 2;
  const pid_t parent = (pid_t)strtol(argv[2], NULL, 10);
  if (parent <= 0 || getppid() != parent ||
      prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != parent ||
      prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) fail("DECODER_NO_NEW_PRIVS");

  const long abi = syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
  if (abi < 3) fail("DECODER_LANDLOCK_UNAVAILABLE");
  const struct landlock_ruleset_attr attr = {
    .handled_access_fs = (LANDLOCK_ACCESS_FS_TRUNCATE << 1) - 1,
  };
  int rules = syscall(SYS_landlock_create_ruleset, &attr, sizeof(attr), 0);
  if (rules < 0) fail("DECODER_LANDLOCK_UNAVAILABLE");
  allow_path(rules, ROOT, READ_DIR);
  allow_path(rules, ROOT "/pdf/bin/qpdf", EXEC_FILE);
  allow_path(rules, ROOT "/pdf/bin/pdftotext", EXEC_FILE);
  allow_path(rules, NODE, EXEC_FILE);
  allow_path(rules, SANDBOX_LINKER, EXEC_FILE);
  allow_path(rules, SANDBOX_LIB, READ_DIR);
  allow_path(rules, "/etc/ld.so.cache", LANDLOCK_ACCESS_FS_READ_FILE);
  allow_path(rules, "/dev/null", LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE);
  if (argv[1][0]) allow_path(rules, argv[1], SCRATCH);
  if (syscall(SYS_landlock_restrict_self, rules, 0)) fail("DECODER_LANDLOCK_ENFORCE");
  close(rules);

  limit(RLIMIT_CORE, 0);
  limit(RLIMIT_NOFILE, 32);
  limit(RLIMIT_NPROC, 48);
  limit(RLIMIT_FSIZE, 12 * 1024 * 1024);
  limit(RLIMIT_CPU, 15);
  limit(RLIMIT_DATA, 160 * 1024 * 1024);

  struct sock_filter filter[] = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SANDBOX_ARCH, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
#if defined(__x86_64__)
    BPF_JUMP(BPF_JMP | BPF_JGE | BPF_K, 0x40000000, 0, 1),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
#endif
    DENY(socket), DENY(connect), DENY(bind), DENY(listen),
    DENY(ptrace), DENY(process_vm_readv), DENY(process_vm_writev),
    DENY(pidfd_open), DENY(pidfd_getfd), DENY(pidfd_send_signal),
    DENY(kill), DENY(tkill), DENY(tgkill), DENY(rt_sigqueueinfo), DENY(rt_tgsigqueueinfo),
    DENY(setsid), DENY(setpgid), DENY(unshare), DENY(setns),
    DENY(setpriority), DENY(sched_setaffinity), DENY(sched_setscheduler), DENY(sched_setparam),
    DENY(io_uring_setup), DENY(io_uring_register), DENY(io_uring_enter),
    DENY(bpf), DENY(perf_event_open), DENY(userfaultfd),
    DENY(shmget), DENY(shmat), DENY(shmctl), DENY(semget), DENY(msgget),
    DENY(keyctl), DENY(add_key), DENY(request_key),
    DENY(open_by_handle_at), DENY(mount), DENY(umount2), DENY(pivot_root),
#if defined(__x86_64__)
    DENY(chmod), DENY(chown), DENY(lchown), DENY(utime), DENY(utimes), DENY(futimesat),
#endif
    DENY(fchmod), DENY(fchmodat), DENY(fchmodat2), DENY(fchown), DENY(fchownat), DENY(utimensat),
    DENY(setxattr), DENY(lsetxattr), DENY(fsetxattr), DENY(removexattr), DENY(lremovexattr), DENY(fremovexattr),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_prctl, 0, 3),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[0])),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, PR_SET_PDEATHSIG, 0, 1),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
    // libc uses prlimit64 for its own stack. Do not allow changing the backend's limits.
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_prlimit64, 0, 3),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[0])),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 0, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
  };
  const struct sock_fprog program = {
    .len = sizeof(filter) / sizeof(filter[0]), .filter = filter,
  };
  if (prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &program)) fail("DECODER_SECCOMP");
  int death_signal = 0;
  if (prctl(PR_GET_PDEATHSIG, &death_signal) || death_signal != SIGKILL ||
      prctl(PR_SET_PDEATHSIG, 0) != -1 || errno != EPERM)
    fail("DECODER_PDEATHSIG");

  if (clearenv() || setenv("LANG", "C.UTF-8", 1) ||
      setenv("NODE_ENV", "production", 1) ||
      setenv("MALLOC_ARENA_MAX", "2", 1) ||
      setenv("UV_THREADPOOL_SIZE", "1", 1)) fail("DECODER_ENV");
  argv[1] = NODE;
  argv[2] = "--jitless";
  argv[3] = "--max-old-space-size=48";
  execv(NODE, argv + 1);
  fail("DECODER_EXEC");
}
