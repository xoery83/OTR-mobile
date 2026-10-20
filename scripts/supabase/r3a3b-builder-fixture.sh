#!/bin/sh
set -eu
ulimit -c 0
initdb -D /proof/data -U supabase_admin --auth-local=trust --auth-host=scram-sha-256 >/proof/init.log
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=OTR-Fixture-CA -keyout /proof/ca.key -out /proof/ca.crt >/proof/tls.log 2>&1
openssl req -newkey rsa:2048 -nodes -subj /CN=localhost -keyout /proof/server.key -out /proof/server.csr >>/proof/tls.log 2>&1
printf 'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n' >/proof/ext
openssl x509 -req -in /proof/server.csr -CA /proof/ca.crt -CAkey /proof/ca.key -CAcreateserial -days 1 -extfile /proof/ext -out /proof/server.crt >>/proof/tls.log 2>&1
chmod 600 /proof/server.key
cat > /proof/data/pg_hba.conf <<'HBA'
local all all trust
hostssl all supabase_admin,postgres,app_observer,monitor_observer 127.0.0.1/32 trust
hostssl all all 127.0.0.1/32 scram-sha-256
hostssl all supabase_admin,postgres,app_observer,monitor_observer ::1/128 trust
hostssl all all ::1/128 scram-sha-256
HBA
cat >> /proof/data/postgresql.conf <<'CONFIG'
listen_addresses='localhost'
ssl=on
ssl_cert_file='/proof/server.crt'
ssl_key_file='/proof/server.key'
shared_preload_libraries='pg_stat_statements,pgaudit,auto_explain'
session_preload_libraries='supautils'
supautils.superuser='supabase_admin'
supautils.privileged_role='supabase_privileged_role'
supautils.privileged_role_allowed_configs='auto_explain.*, deadlock_timeout, log_duration, log_lock_waits, log_min_duration_statement, log_min_error_statement, log_min_messages, log_parameter_max_length, log_replication_commands, log_statement, log_temp_files, pg_net.batch_size, pg_net.ttl, pg_stat_statements.*, pgaudit.log, pgaudit.log_catalog, pgaudit.log_client, pgaudit.log_level, pgaudit.log_relation, pgaudit.log_rows, pgaudit.log_statement, pgaudit.log_statement_once, pgaudit.role, pgrst.*, plan_filter.*, safeupdate.enabled, session_replication_role, track_functions, track_io_timing, wal_compression'
log_statement='all'
log_min_error_statement='error'
log_min_duration_statement=0
log_parameter_max_length=-1
log_parameter_max_length_on_error=-1
pgaudit.log='all'
pgaudit.log_parameter=on
auto_explain.log_min_duration=0
auto_explain.log_nested_statements=on
password_encryption='scram-sha-256'
logging_collector=on
log_directory='/proof/logs'
log_filename='server.log'
CONFIG
exec postgres -D /proof/data
