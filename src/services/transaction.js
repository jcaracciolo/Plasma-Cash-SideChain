const { recover }            					= require('../utils/sign')
	, { TransactionService, CoinStateService }	= require('./index')
	, { generateTransactionHash,
		pubToAddress }						= require('../utils/cryptoUtils')
	, { transactionToJson }						= require('../utils/utils')
	, { BigNumber }       					= require('bignumber.js');

const createTransaction = (_slot, _owner, _recipient, _hash, _blockSpent, _signature, cb) => {
	const slot = new BigNumber(_slot);
	const owner = _owner.toLowerCase();
	const recipient = _recipient.toLowerCase();
	const hash = _hash.toLowerCase();
	const blockSpent = new BigNumber(_blockSpent);
	const signature = _signature.toLowerCase();


	if(slot.isNaN()) 	return cb({statusCode: 400, message: 'Invalid slot'});
	if(blockSpent.isNaN()) 	return cb({statusCode: 400, message: 'Invalid blockSpent'});

	isTransactionValid({slot, owner, recipient, hash, blockSpent, signature}, (err, invalidError) => {
		if (err) return cb(err);
		if (invalidError) return cb({statusCode: 400, message: invalidError} );

		TransactionService.create({
			slot: slot,
			owner,
			recipient,
			_id: hash,
			block_spent: blockSpent,
			signature
		}, (err, t) => {
			if(err) return cb(err)
			cb(null, { statusCode: 201, message: transactionToJson(t) })
		});
	})
};
/**
 * Given a transaction, determines if is valid or not. Slot and BlockSpent must be BigNumbers
 * @param {*} transaction
 * @param {(err, invalidErr) => void } validateTransactionCb where err is a non-validating error, invalidErr is a validating error.
 * Callback being call without parameters means the transaction is valid
 */
const isTransactionValid = (transaction, validateTransactionCb) => {
	const { slot, owner, recipient, hash, blockSpent, signature } = transaction;

		getLastMinedTransaction({ slot: slot }, (err, lastTransaction) => {

			if (err) return validateTransactionCb(err);
			if (!lastTransaction) return validateTransactionCb(null, 'Slot is not in side chain');

			const { mined_block } = lastTransaction;
			if (!mined_block) return validateTransactionCb(null, 'Last mined block does not exist');

			if (!mined_block.block_number.eq(blockSpent)) return validateTransactionCb(null, 'blockSpent is invalid');

			const calculatedHash = generateTransactionHash(slot, blockSpent, new BigNumber(1), recipient);

			if (hash !== calculatedHash) return validateTransactionCb(null, 'Hash invalid');

			if(lastTransaction.recipient.toLowerCase() !== owner.toLowerCase()) return validateTransactionCb(null, "Owner does not match");

			try {
				const pubAddress = pubToAddress(recover(hash, signature));
				if(owner.toLowerCase() !== pubAddress) return validateTransactionCb(null, 'Owner did not sign this');
			} catch (e) {
				return validateTransactionCb(null, 'Invalid Signature');
			}

			CoinStateService.findById(slot, (err, coinState) => {
				if (err) return validateTransactionCb(err);

				if(coinState.state != "DEPOSITED") {
					return validateTransactionCb(null, "Coin state is not DEPOSITED");
				} else {
					return validateTransactionCb();
				}
			})
	})
};

const getLastMinedTransaction = (filter, cb) => {
	filter.mined_block = { $ne: null }
	TransactionService
	.findOne(filter)
	.sort({mined_block: -1})
	.collation({locale: "en_US", numericOrdering: true})
	.populate("mined_block")
	.exec((err, transaction) => {
		if (err) return cb(err);
		cb(null, transaction);
	});
}

const getPrevLastMinedTransaction = (filter, cb) => {
	filter.mined_block = { $ne: null }
	TransactionService
	.find(filter)
	.sort({mined_block: -1})
	.collation({locale: "en_US", numericOrdering: true})
	.populate("mined_block")
	.skip(1)
	.limit(1)
	.exec((err, transaction) => {
		if (err) return cb(err);
		cb(null, transaction[0]);
	});
}

module.exports = {
	createTransaction,
	isTransactionValid,
	getLastMinedTransaction,
	getPrevLastMinedTransaction
};