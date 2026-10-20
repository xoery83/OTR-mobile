import * as Crypto from "expo-crypto";

import {
  canonicalSettlementStatementJson,
  type SettlementStatement,
} from "@/domain/ledger/settlementStatement";

export function digestSettlementStatement(statement: SettlementStatement) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonicalSettlementStatementJson(statement),
  );
}
