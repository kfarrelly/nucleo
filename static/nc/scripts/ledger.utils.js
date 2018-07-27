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

/*
getLedgerStrAppVersion().then(v => console.log(v));

getLedgerStrPublicKey().then(pk => {
    console.log(pk);
});

const signLedgerStrTransaction = async (publicKey) => {
  const transaction = new StellarSdk.TransactionBuilder({accountId: () => publicKey, sequenceNumber: () => '1234', incrementSequenceNumber: () => null})
    .addOperation(StellarSdk.Operation.createAccount({
       source: publicKey,
       destination: 'GBLYVYCCCRYTZTWTWGOMJYKEGQMTH2U3X4R4NUI7CUGIGEJEKYD5S5OJ', // SATIS5GR33FXKM7HVWZ2UQO33GM66TVORZUEF2HPUQ3J7K634CTOAWQ7
       startingBalance: '11.331',
    }))
    .build();
  const transport = await LedgerTransport.create();
  const str = new Str(transport);
  const result = await str.signTransaction("44'/148'/0'", transaction.signatureBase());

  // add signature to transaction
  const keyPair = StellarSdk.Keypair.fromPublicKey(publicKey);
  const hint = keyPair.signatureHint();
  const decorated = new StellarSdk.xdr.DecoratedSignature({hint: hint, signature: result.signature});
  transaction.signatures.push(decorated);

  return transaction;
}
*/
// signStrTransaction(publicKey).then(transaction => console.log(transaction.toEnvelope().toXDR().toString('base64')));
