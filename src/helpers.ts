/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { BigDecimal, Bytes } from '@graphprotocol/graph-ts/index'
import { AccountBToken, Account } from '../generated/schema'

export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = 0; i < decimals; i++) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export let mantissaFactor = 18
export let bTokenDecimals = 8
export let birdPlusDecimals = 6
export let mantissaFactorBD: BigDecimal = exponentToBigDecimal(18)
export let bTokenDecimalsBD: BigDecimal = exponentToBigDecimal(8)
export let birdPlusDecimalsBD: BigDecimal = exponentToBigDecimal(6)
export let zeroBD = BigDecimal.fromString('0')

export function createAccountBToken(
  bTokenStatsID: string,
  symbol: string,
  account: string,
  marketID: string,
): AccountBToken {
  let bTokenStats = new AccountBToken(bTokenStatsID)
  bTokenStats.symbol = symbol
  bTokenStats.market = marketID
  bTokenStats.account = account
  bTokenStats.transactionHashes = []
  bTokenStats.transactionTimes = []
  bTokenStats.accrualBlockNumber = 0
  bTokenStats.bTokenBalance = zeroBD
  bTokenStats.totalUnderlyingSupplied = zeroBD
  bTokenStats.totalUnderlyingRedeemed = zeroBD
  bTokenStats.isUnderlyingApproved = false
  bTokenStats.accountBorrowIndex = zeroBD
  bTokenStats.totalUnderlyingBorrowed = zeroBD
  bTokenStats.totalUnderlyingRepaid = zeroBD
  bTokenStats.storedBorrowBalance = zeroBD
  bTokenStats.enteredMarket = false
  return bTokenStats
}

export function createAccount(accountID: string): Account {
  let account = new Account(accountID)
  account.countLiquidated = 0
  account.countLiquidator = 0
  account.hasBorrowed = false
  // account.birdPlusBalance = zeroBD
  account.save()
  return account
}

export function updateCommonBTokenStats(
  marketID: string,
  marketSymbol: string,
  accountID: string,
  txHash: Bytes,
  timestamp: i32,
  blockNumber: i32,
): AccountBToken {
  let bTokenStatsID = marketID.concat('-').concat(accountID)
  let bTokenStats = AccountBToken.load(bTokenStatsID)
  if (bTokenStats == null) {
    bTokenStats = createAccountBToken(bTokenStatsID, marketSymbol, accountID, marketID)
  }
  let txHashes = bTokenStats.transactionHashes
  txHashes.push(txHash)
  bTokenStats.transactionHashes = txHashes
  let txTimes = bTokenStats.transactionTimes
  txTimes.push(timestamp)
  bTokenStats.transactionTimes = txTimes
  bTokenStats.accrualBlockNumber = blockNumber
  return bTokenStats as AccountBToken
}