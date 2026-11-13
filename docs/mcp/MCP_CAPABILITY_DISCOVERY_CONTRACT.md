# Capability discovery — Phase4 candidate

`McpOptions.taskAssistant` defaults false. When true, Initialize instructions and
the normal `get_otr_operating_guide` tool advertise OPERATING/FIELDS/CAPABILITIES.
`guide.ts` is the versioned source; `MCP_AI_OPERATING_GUIDE.md` is its rendered copy.
No Resources auto-injection assumption, provider call or business write.

CAPABILITIES is derived from this connection's verified scopes, client identity,
available Backend port and host write policy. It is not object permission or
evidence of cloud acceptance. Backend ACL/confirmation/CAS remain authoritative.
People/Expense/Source readers and writes are explicitly disconnected. An absent
reader never means an empty collection. No API accepts Account identity in tool
arguments. Guide calls require current authenticated Trip Read context.

Standard SDK Initialize/listTools/callTool tests cover default-off, normal Read
guide access and no business dispatch. Consumer fresh-chat discovery NOT_TESTED.
