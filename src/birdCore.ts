/* eslint-disable prefer-const */ // to satisfy AS compiler

import { BigDecimal } from '@graphprotocol/graph-ts'
import {
    MarketEntered,
    MarketExited,
    NewCloseFactor,
    NewCollateralFactor,
    NewLiquidationIncentive,
    NewMaxAssets,
    NewPriceOracle,
    MarketListed,
    NewBirdPlusRate,
    BirdPlusSpeedUpdated,
    DistributedBorrowerBirdPlus,
    DistributedSupplierBirdPlus
  } from '../generated/BirdCore/BirdCore'
  
  // import { BToken } from '../generated/BToken/BToken'
  import { Market, BirdCore, Account, DistributedSupplierBirdPlusEvent, DistributedBorrowerBirdPlusEvent } from '../generated/schema'
  import { mantissaFactorBD, mantissaFactor, bTokenDecimalsBD ,updateCommonBTokenStats, createAccount, birdPlusDecimalsBD } from './helpers'
  import { createMarket } from './markets'
  
  export function handleMarketListed(event: MarketListed): void {
    // Dynamically index all new listed tokens
    // BToken.create(event.params.bToken)
    // Create the market for this token, since it's now been listed.
    let market = createMarket(event.params.bToken.toHexString())
    market.save()
  }

  export function handleMarketEntered(event: MarketEntered): void {
    let market = Market.load(event.params.bToken.toHexString())
    if (market != null) {
      let accountID = event.params.account.toHex()
      let account = Account.load(accountID)
      if (account == null) {
        createAccount(accountID)
      }

      let bTokenStats = updateCommonBTokenStats(
        market.id,
        market.symbol,
        accountID,
        event.transaction.hash,
        event.block.timestamp.toI32(),
        event.block.number.toI32(),
      )
      bTokenStats.enteredMarket = true
      bTokenStats.save()
    }
  }
  
  export function handleMarketExited(event: MarketExited): void {
    let market = Market.load(event.params.bToken.toHexString())
    if (market != null) {
      let accountID = event.params.account.toHex()
      let account = Account.load(accountID)
      if (account == null) {
        createAccount(accountID)
      }

      let bTokenStats = updateCommonBTokenStats(
        market.id,
        market.symbol,
        accountID,
        event.transaction.hash,
        event.block.timestamp.toI32(),
        event.block.number.toI32(),
      )
      bTokenStats.enteredMarket = false
      bTokenStats.save()
    }
  }
  
  export function handleNewCloseFactor(event: NewCloseFactor): void {
    let birdCore = BirdCore.load('1')
    if (birdCore == null) {
        birdCore = new BirdCore('1')
      }
    birdCore.closeFactor = event.params.newCloseFactorMantissa
    birdCore.save()
  }
  
  export function handleNewCollateralFactor(event: NewCollateralFactor): void {
    let market = Market.load(event.params.bToken.toHexString())
    if (market != null) {
      market.collateralFactor = event.params.newCollateralFactorMantissa
        .toBigDecimal()
        .div(mantissaFactorBD)
      market.save()
    }
  }
  
  // This should be the first event acccording to etherscan but it isn't.... price oracle is. weird
  export function handleNewLiquidationIncentive(event: NewLiquidationIncentive): void {
    let birdCore = BirdCore.load('1')
    if (birdCore == null) {
      birdCore = new BirdCore('1')
    }
    birdCore.liquidationIncentive = event.params.newLiquidationIncentiveMantissa
    birdCore.save()
  }
  
  export function handleNewMaxAssets(event: NewMaxAssets): void {
    let birdCore = BirdCore.load('1')
    if (birdCore == null) {
      birdCore = new BirdCore('1')
    }
    birdCore.maxAssets = event.params.newMaxAssets
    birdCore.save()
  }
  
  export function handleNewPriceOracle(event: NewPriceOracle): void {
    let birdCore = BirdCore.load('1')
    // This is the first event used in this mapping, so we use it to create the entity
    if (birdCore == null) {
      birdCore = new BirdCore('1')
    }
    birdCore.priceOracle = event.params.newPriceOracle
    birdCore.save()
  }

  export function handleNewBirdPlusRate(event: NewBirdPlusRate): void {
    let birdCore = BirdCore.load('1')
    // This is the first event used in this mapping, so we use it to create the entity
    if (birdCore == null) {
      birdCore = new BirdCore('1')
    }
    birdCore.birdPlusRate = event.params.newBirdRate
      .toBigDecimal()
      .div(birdPlusDecimalsBD)
    birdCore.save()
  }

  export function handleBirdPlusSpeedUpdated(event: BirdPlusSpeedUpdated): void {
    let market = Market.load(event.params.bToken.toHexString())
    if (market != null) {
      market.birdPlusSpeed = event.params.newSpeed
        .toBigDecimal()
        .div(mantissaFactorBD)
      market.save()
    }
  }

  export function handleDistributedSupplierBirdPlus(event: DistributedSupplierBirdPlus): void {
    let market = Market.load(event.params.bToken.toHexString())
    if (market != null) {
      let accountID = event.params.supplier.toHex()
      let account = Account.load(accountID)
      if (account != null) {
        // account.birdPlusBalance = account.birdPlusBalance.minus(
        //   event.params.birdPlusDelta.toBigDecimal()
        //   .div(mantissaFactorBD)
        //   .truncate(mantissaFactor))
          
        // account.save()

        let supplyID = event.transaction.hash
          .toHexString()
          .concat('-')
          .concat(event.transactionLogIndex.toString())
      
        let birdPlusAmount = event.params.birdDelta
          .toBigDecimal()
          .div(mantissaFactorBD)
          .truncate(mantissaFactor)  

        if (birdPlusAmount.gt(BigDecimal.fromString('0'))) {
          let birdPlusSupplyIndex = event.params.birdSupplyIndex.toBigDecimal()

          let supply = new DistributedSupplierBirdPlusEvent(supplyID)
          supply.supplier = event.params.supplier
          supply.birdPlusAmount = birdPlusAmount
          supply.birdPlusSupplyIndex = birdPlusSupplyIndex
          supply.blockNumber = event.block.number.toI32()
          supply.blockTime = event.block.timestamp.toI32()
          supply.bTokenSymbol = market.symbol
          supply.save()
        }
      }
    }
  }

  export function handleDistributedBorrowerBirdPlus(event: DistributedBorrowerBirdPlus): void {
    let market = Market.load(event.params.bToken.toHexString())
    if (market != null) {
      let accountID = event.params.borrower.toHex()
      let account = Account.load(accountID)
      if (account != null) {
        // account.birdPlusBalance = account.birdPlusBalance.minus(
        //   event.params.birdPlusDelta.toBigDecimal()
        //   .div(mantissaFactorBD)
        //   .truncate(mantissaFactor))
        
        // account.save()

        let borrowID = event.transaction.hash
          .toHexString()
          .concat('-')
          .concat(event.transactionLogIndex.toString())
      
        let birdPlusAmount = event.params.birdDelta
          .toBigDecimal()
          .div(mantissaFactorBD)
          .truncate(mantissaFactor)
      
        if (birdPlusAmount.gt(BigDecimal.fromString('0'))) {
          let birdPlusBorrowIndex = event.params.birdBorrowIndex.toBigDecimal()

          let borrow = new DistributedBorrowerBirdPlusEvent(borrowID)
          borrow.borrower = event.params.borrower
          borrow.birdPlusAmount = birdPlusAmount
          borrow.birdPlusBorrowIndex = birdPlusBorrowIndex
          borrow.blockNumber = event.block.number.toI32()
          borrow.blockTime = event.block.timestamp.toI32()
          borrow.bTokenSymbol = market.symbol
          borrow.save()
        }
      }
    }
  }