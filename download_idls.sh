#!/bin/bash
mkdir -p idls

echo "🔄 Baixando IDL do Meteora DBC..."
anchor idl fetch dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN --provider.cluster mainnet -o idls/meteora_dbc.json

echo "🔄 Baixando IDL do Moonshot..."
anchor idl fetch MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG --provider.cluster mainnet -o idls/moonshot.json

echo "🔄 Baixando IDL do Bonk.fun (LetsBonk)..."
anchor idl fetch FfYek5vEz23cMkWsdJwG2oa6EphsvXSHrGpdALN4g6W1 --provider.cluster mainnet -o idls/bonk_fun.json

echo "🔄 Baixando IDL do daos.fun..."
anchor idl fetch 5jnapfrAN47UYkLkEf7HnprPPBCQLvkYWGZDeKkaP5hv --provider.cluster mainnet -o idls/daos_fun.json

echo "✅ Todos os IDLs baixados com sucesso na pasta ./idls/"
ls -lh idls/
