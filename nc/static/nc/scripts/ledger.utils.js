/*
NOTE: https://github.com/LedgerHQ/ledgerjs/tree/master/packages/hw-app-str
*/
const isStellarLedgerSupported = async () => {
  const result = await StellarLedger.Transport.isSupported();
  return result;
}

const getStellarLedgerAppVersion = async () => {
    const transport = await StellarLedger.Transport.create();
    const str = new StellarLedger.Api(transport);
    const result = await str.getAppConfiguration();
    return result.version;
};

const getStellarLedgerPublicKey = async () => {
  const transport = await StellarLedger.Transport.create();
  const str = new StellarLedger.Api(transport);
  const result = await str.getPublicKey("44'/148'/0'");
  return result.publicKey;
};

const signTransactionWithStellarLedger = async (transaction) => {
  const transport = await StellarLedger.Transport.create();
  const str = new StellarLedger.Api(transport);
  const result = await str.signTransaction("44'/148'/0'", transaction.signatureBase());

  // add signature to transaction
  const keyPair = StellarSdk.Keypair.fromPublicKey(transaction.source.accountId());
  const hint = keyPair.signatureHint();
  const decorated = new StellarSdk.xdr.DecoratedSignature({hint: hint, signature: result.signature});
  transaction.signatures.push(decorated);

  return transaction;
}

const signAndSubmitTransactionWithStellarLedger = async (server, transaction) => {
  const signedTransaction = await signTransactionWithStellarLedger(transaction);
  return server.submitTransaction(signedTransaction);
}
