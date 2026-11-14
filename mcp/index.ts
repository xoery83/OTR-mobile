export {
  createMcpHandler,
  type McpAuthorization,
  type McpOptions,
  type McpLogEvent,
} from "./server";
export {
  createOAuthAuthorizer,
  protectedResourceMetadata,
  type OAuthOptions,
  type OAuthGrant,
} from "./oauth";
export type { BackendMutation, ConfirmChanges, ApprovalRequest } from "./mutation";
export type { BackendRead } from "./read";
export {
  createDomainAdapters,
  prepareMetadata,
  prepareTraveler,
  prepareExpense,
  prepareExpenseCreate,
  prepareExpenseUpdate,
  type DomainBackend,
  type DomainContext,
  type ExpenseRecovery,
} from "./domainAdapter";
export type { TaskDomainBinding, BindTaskDomains } from "./domainToolRegistry";
