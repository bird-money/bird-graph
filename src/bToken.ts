/* eslint-disable prefer-const */ // to satisfy AS compiler
import { log } from '@graphprotocol/graph-ts/index'

import {
  MintToken,
  RedeemToken,
  BorrowToken,
  RepayBorrowToken,
  LiquidateBorrowToken,
  Transfer,
  AccrueInterestToken,
  NewTokenReserveFactor,
  NewMarketTokenInterestRateModel,
} from '../generated/BToken/BToken'

import {
  PricePosted
} from '../generated/SimplePriceOracle/SimplePriceOracle'

import {
  Market,
  Account,
  MintTokenEvent,
  RedeemTokenEvent,
  LiquidationTokenEvent,
  TransferEvent,
  BorrowTokenEvent,
  RepayTokenEvent
} from '../generated/schema'

import { createMarket, updateMarket } from './markets'
import {
  createAccount,
  updateCommonBTokenStats,
  exponentToBigDecimal,
  bTokenDecimalsBD,
  bTokenDecimals,
  zeroBD,
} from './helpers'

/* Account supplies assets into market and receives bTokens in exchange
 *
 * event.mintAmount is the underlying asset
 * event.mintTokens is the amount of bTokens minted
 * event.minter is the account
 *
 * Notes
 *    Transfer event will always get emitted with this
 *    Mints originate from the bToken address, not 0x000000, which is typical of ERC-20s
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    No need to updateCommonBTokenStats, handleTransfer() will
 *    No need to update bTokenBalance, handleTransfer() will
 */
export function handleMintToken(event: MintToken): void {
  let market = Market.load(event.address.toHexString())
  if (market != null) {
    let mintID = event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(event.transactionLogIndex.toString())

    let bTokenAmount = event.params.mintTokens
      .toBigDecimal()
      .div(bTokenDecimalsBD)
      .truncate(bTokenDecimals)
    let underlyingAmount = event.params.mintAmount
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    let mint = new MintTokenEvent(mintID)
    mint.amount = bTokenAmount
    mint.to = event.params.minter
    mint.from = event.address
    mint.blockNumber = event.block.number.toI32()
    mint.blockTime = event.block.timestamp.toI32()
    mint.bTokenSymbol = market.symbol
    mint.underlyingAmount = underlyingAmount
    mint.save()
  }
}

/*  Account supplies bTokens into market and receives underlying asset in exchange
 *
 *  event.redeemAmount is the underlying asset
 *  event.redeemTokens is the bTokens
 *  event.redeemer is the account
 *
 *  Notes
 *    Transfer event will always get emitted with this
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    No need to updateCommonBTokenStats, handleTransfer() will
 *    No need to update bTokenBalance, handleTransfer() will
 */
export function handleRedeemToken(event: RedeemToken): void {
  let market = Market.load(event.address.toHexString())
  if (market != null) {
    let redeemID = event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(event.transactionLogIndex.toString())

    let bTokenAmount = event.params.redeemTokens
      .toBigDecimal()
      .div(bTokenDecimalsBD)
      .truncate(bTokenDecimals)
    let underlyingAmount = event.params.redeemAmount
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    let redeem = new RedeemTokenEvent(redeemID)
    redeem.amount = bTokenAmount
    redeem.to = event.address
    redeem.from = event.params.redeemer
    redeem.blockNumber = event.block.number.toI32()
    redeem.blockTime = event.block.timestamp.toI32()
    redeem.bTokenSymbol = market.symbol
    redeem.underlyingAmount = underlyingAmount
    redeem.save()
  }
}

/* Borrow assets from the protocol. All values either ETH or ERC20
 *
 * event.params.totalBorrows = of the whole market (not used right now)
 * event.params.accountBorrows = total of the account
 * event.params.borrowAmount = that was added in this event
 * event.params.borrower = the account
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 */
export function handleBorrowToken(event: BorrowToken): void {
  let market = Market.load(event.address.toHexString())
  if (market != null) {
    let accountID = event.params.borrower.toHex()

    let account = Account.load(accountID)
    if (account == null) {
      account = createAccount(accountID)
    }
    account.hasBorrowed = true
    account.save()

    // Update bTokenStats common for all events, and return the stats to update unique
    // values for each event
    let bTokenStats = updateCommonBTokenStats(
      market.id,
      market.symbol,
      accountID,
      event.transaction.hash,
      event.block.timestamp.toI32(),
      event.block.number.toI32(),
    )

    let borrowAmountBD = event.params.borrowAmount
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
    let previousBorrow = bTokenStats.storedBorrowBalance

    bTokenStats.storedBorrowBalance = event.params.accountBorrows
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    bTokenStats.accountBorrowIndex = market.borrowIndex
    bTokenStats.totalUnderlyingBorrowed = bTokenStats.totalUnderlyingBorrowed.plus(
      borrowAmountBD,
    )
    bTokenStats.save()

    if (
      previousBorrow.equals(zeroBD) &&
      !event.params.accountBorrows.toBigDecimal().equals(zeroBD) // checking edge case for borrwing 0
    ) {
      market.numberOfBorrowers = market.numberOfBorrowers + 1
      market.save()
    }

    let borrowID = event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(event.transactionLogIndex.toString())

    let borrowAmount = event.params.borrowAmount
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    let accountBorrows = event.params.accountBorrows
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    let borrow = new BorrowTokenEvent(borrowID)
    borrow.amount = borrowAmount
    borrow.accountBorrows = accountBorrows
    borrow.borrower = event.params.borrower
    borrow.blockNumber = event.block.number.toI32()
    borrow.blockTime = event.block.timestamp.toI32()
    borrow.underlyingSymbol = market.underlyingSymbol
    borrow.save()
  }
}

/* Repay some amount borrowed. Anyone can repay anyones balance
 *
 * event.params.totalBorrows = of the whole market (not used right now)
 * event.params.accountBorrows = total of the account (not used right now)
 * event.params.repayAmount = that was added in this event
 * event.params.borrower = the borrower
 * event.params.payer = the payer
 *
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    Once a account totally repays a borrow, it still has its account interest index set to the
 *    markets value. We keep this, even though you might think it would reset to 0 upon full
 *    repay.
 */
export function handleRepayBorrowToken(event: RepayBorrowToken): void {
  let market = Market.load(event.address.toHexString())
  if (market != null) {
    let accountID = event.params.borrower.toHex()
    let account = Account.load(accountID)
    if (account == null) {
      createAccount(accountID)
    }

    // Update bTokenStats common for all events, and return the stats to update unique
    // values for each event
    let bTokenStats = updateCommonBTokenStats(
      market.id,
      market.symbol,
      accountID,
      event.transaction.hash,
      event.block.timestamp.toI32(),
      event.block.number.toI32(),
    )

    let repayAmountBD = event.params.repayAmount
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))

    bTokenStats.storedBorrowBalance = event.params.accountBorrows
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    bTokenStats.accountBorrowIndex = market.borrowIndex
    bTokenStats.totalUnderlyingRepaid = bTokenStats.totalUnderlyingRepaid.plus(
      repayAmountBD,
    )
    bTokenStats.save()

    if (bTokenStats.storedBorrowBalance.equals(zeroBD)) {
      market.numberOfBorrowers = market.numberOfBorrowers - 1
      market.save()
    }

    let repayID = event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(event.transactionLogIndex.toString())

    let repayAmount = event.params.repayAmount
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    let accountBorrows = event.params.accountBorrows
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    let repay = new RepayTokenEvent(repayID)
    repay.amount = repayAmount
    repay.accountBorrows = accountBorrows
    repay.borrower = event.params.borrower
    repay.blockNumber = event.block.number.toI32()
    repay.blockTime = event.block.timestamp.toI32()
    repay.underlyingSymbol = market.underlyingSymbol
    repay.payer = event.params.payer
    repay.save()
  }
}

/*
 * Liquidate an account who has fell below the collateral factor.
 *
 * event.params.borrower - the borrower who is getting liquidated of their bTokens
 * event.params.bTokenCollateral - the market ADDRESS of the bToken being liquidated
 * event.params.liquidator - the liquidator
 * event.params.repayAmount - the amount of underlying to be repaid
 * event.params.seizeTokens - bTokens seized (transfer event should handle this)
 *
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this.
 *    When calling this function, event RepayBorrow, and event Transfer will be called every
 *    time. This means we can ignore repayAmount. Seize tokens only changes state
 *    of the bTokens, which is covered by transfer. Therefore we only
 *    add liquidation counts in this handler.
 */
export function handleLiquidateBorrowToken(event: LiquidateBorrowToken): void {

  let marketRepayToken = Market.load(event.address.toHexString())
  if (marketRepayToken != null) {
    let marketBTokenLiquidated = Market.load(event.params.bTokenCollateral.toHexString())
    if (marketBTokenLiquidated != null) {

      let liquidatorID = event.params.liquidator.toHex()
      let liquidator = Account.load(liquidatorID)
      if (liquidator == null) {
        liquidator = createAccount(liquidatorID)
      }
      liquidator.countLiquidator = liquidator.countLiquidator + 1
      liquidator.save()

      let borrowerID = event.params.borrower.toHex()
      let borrower = Account.load(borrowerID)
      if (borrower == null) {
        borrower = createAccount(borrowerID)
      }
      borrower.countLiquidated = borrower.countLiquidated + 1
      borrower.save()

      // For a liquidation, the liquidator pays down the borrow of the underlying
      // asset. They seize one of potentially many types of bToken collateral of
      // the underwater borrower. So we must get that address from the event, and
      // the repay token is the event.address

      let mintID = event.transaction.hash
        .toHexString()
        .concat('-')
        .concat(event.transactionLogIndex.toString())

      let bTokenAmount = event.params.seizeTokens
        .toBigDecimal()
        .div(bTokenDecimalsBD)
        .truncate(bTokenDecimals)
      let underlyingRepayAmount = event.params.repayAmount
        .toBigDecimal()
        .div(exponentToBigDecimal(marketRepayToken.underlyingDecimals))
        .truncate(marketRepayToken.underlyingDecimals)

      let liquidation = new LiquidationTokenEvent(mintID)
      liquidation.amount = bTokenAmount
      liquidation.to = event.params.liquidator
      liquidation.from = event.params.borrower
      liquidation.blockNumber = event.block.number.toI32()
      liquidation.blockTime = event.block.timestamp.toI32()
      liquidation.underlyingSymbol = marketRepayToken.underlyingSymbol
      liquidation.underlyingRepayAmount = underlyingRepayAmount
      liquidation.bTokenSymbol = marketBTokenLiquidated.symbol
      liquidation.save()
    }
  }
}

/* Transferring of bTokens
 *
 * event.params.from = sender of bTokens
 * event.params.to = receiver of bTokens
 * event.params.amount = amount sent
 *
 * Notes
 *    Possible ways to emit Transfer:
 *      seize() - i.e. a Liquidation Transfer (does not emit anything else)
 *      redeemFresh() - i.e. redeeming your bTokens for underlying asset
 *      mintFresh() - i.e. you are lending underlying assets to create bTokens
 *      transfer() - i.e. a basic transfer
 *    This function handles all 4 cases. Transfer is emitted alongside the mint, redeem, and seize
 *    events. So for those events, we do not update bToken balances.
 */
export function handleTransfer(event: Transfer): void {
  // We only updateMarket() if accrual block number is not up to date. This will only happen
  // with normal transfers, since mint, redeem, and seize transfers will already run updateMarket()
  let marketID = event.address.toHexString()
  let market = Market.load(marketID)
  if (market !== null) {
    log.debug('bToken transfer', [])
    if (market.accrualBlockNumber != event.block.number.toI32()) {
      market = updateMarket(
        event.address,
        event.block.number.toI32(),
        event.block.timestamp.toI32(),
      )
    }

    let amountUnderlying = market.exchangeRate.times(
      event.params.amount.toBigDecimal().div(bTokenDecimalsBD),
    )
    let amountUnderylingTruncated = amountUnderlying.truncate(market.underlyingDecimals)

    // Checking if the tx is FROM the bToken contract (i.e. this will not run when minting)
    // If so, it is a mint, and we don't need to run these calculations

    let accountFromID = event.params.from.toHex()
    if (accountFromID != marketID) {
      let accountFrom = Account.load(accountFromID)
      if (accountFrom == null) {
        createAccount(accountFromID)
      }

      // Update bTokenStats common for all events, and return the stats to update unique
      // values for each event
      let bTokenStatsFrom = updateCommonBTokenStats(
        market.id,
        market.symbol,
        accountFromID,
        event.transaction.hash,
        event.block.timestamp.toI32(),
        event.block.number.toI32(),
      )

      bTokenStatsFrom.bTokenBalance = bTokenStatsFrom.bTokenBalance.minus(
        event.params.amount
          .toBigDecimal()
          .div(bTokenDecimalsBD)
          .truncate(bTokenDecimals),
      )

      bTokenStatsFrom.totalUnderlyingRedeemed = bTokenStatsFrom.totalUnderlyingRedeemed.plus(
        amountUnderylingTruncated,
      )
      bTokenStatsFrom.save()

      if (bTokenStatsFrom.bTokenBalance.equals(zeroBD)) {
        market.numberOfSuppliers = market.numberOfSuppliers - 1
        market.save()
      }
    }

    // Checking if the tx is TO the bToken contract (i.e. this will not run when redeeming)
    // If so, we ignore it. this leaves an edge case, where someone who accidentally sends
    // bTokens to a bToken contract, where it will not get recorded. Right now it would
    // be messy to include, so we are leaving it out for now TODO fix this in future
    let accountToID = event.params.to.toHex()
    if (accountToID != marketID) {
      let accountTo = Account.load(accountToID)
      if (accountTo == null) {
        createAccount(accountToID)
      }

      // Update bTokenStats common for all events, and return the stats to update unique
      // values for each event
      let bTokenStatsTo = updateCommonBTokenStats(
        market.id,
        market.symbol,
        accountToID,
        event.transaction.hash,
        event.block.timestamp.toI32(),
        event.block.number.toI32(),
      )

      let previousBTokenBalanceTo = bTokenStatsTo.bTokenBalance
      bTokenStatsTo.bTokenBalance = bTokenStatsTo.bTokenBalance.plus(
        event.params.amount
          .toBigDecimal()
          .div(bTokenDecimalsBD)
          .truncate(bTokenDecimals),
      )

      bTokenStatsTo.totalUnderlyingSupplied = bTokenStatsTo.totalUnderlyingSupplied.plus(
        amountUnderylingTruncated,
      )
      bTokenStatsTo.save()

      if (
        previousBTokenBalanceTo.equals(zeroBD) &&
        !event.params.amount.toBigDecimal().equals(zeroBD) // checking edge case for transfers of 0
      ) {
        market.numberOfSuppliers = market.numberOfSuppliers + 1
        market.save()
      }
    }
    let transferID = event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(event.transactionLogIndex.toString())

    let transfer = new TransferEvent(transferID)
    transfer.amount = event.params.amount.toBigDecimal().div(bTokenDecimalsBD)
    transfer.to = event.params.to
    transfer.from = event.params.from
    transfer.blockNumber = event.block.number.toI32()
    transfer.blockTime = event.block.timestamp.toI32()
    transfer.bTokenSymbol = market.symbol
    transfer.save()
  } else {
    log.debug('not bToken transfer', [])
  }
}

export function handleAccrueInterestToken(event: AccrueInterestToken): void {
  updateMarket(event.address, event.block.number.toI32(), event.block.timestamp.toI32())
}

export function handleTokenNewReserveFactor(event: NewTokenReserveFactor): void {
  let marketID = event.address.toHex()
  let market = Market.load(marketID)
  if (market == null) {
    market = createMarket(marketID)
    if (market == null) {
      return;
    }
  }
  market.reserveFactor = event.params.newReserveFactorMantissa
  market.save()
}

export function handleNewMarketTokenInterestRateModel(
  event: NewMarketTokenInterestRateModel,
): void {
  let marketID = event.address.toHex()
  let market = Market.load(marketID)
  if (market == null) {
    market = createMarket(marketID)
    if (market == null) {
      return;
    }
  }
  if (market !== null) {
    market.interestRateModelAddress = event.params.newInterestRateModel
    market.save()
  }
}

export function handlePricePosted(event: PricePosted): void {
  let marketID = event.params.asset.toHex()
  let market = Market.load(marketID)
  if (market !== null) {
    updateMarket(event.params.asset, event.block.number.toI32(), event.block.timestamp.toI32())
  }
}
