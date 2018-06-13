function getTxFee(numOrders) {
  /*
  Returns the transaction fee in XLM for a tx with numOrders orders
  in the transaction
  https://www.stellar.org/developers/guides/concepts/fees.html#transaction-fee
  */
  return numOrders * STELLAR_BASE_FEE;
}

function getMinBalance(account) {
  /*
  Determines and returns the minimum required balance for a given account.
  https://www.stellar.org/developers/guides/concepts/fees.html#minimum-account-balance
  https://www.stellar.org/developers/guides/concepts/ledger.html#account-entry
  */
  return STELLAR_BASE_RESERVE * (2 + account.subentry_count);
}
