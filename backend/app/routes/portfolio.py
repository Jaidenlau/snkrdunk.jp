from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db


router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("", response_model=list[schemas.PortfolioItemOut])
def get_portfolio(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.PortfolioItem)
        .options(selectinload(models.PortfolioItem.card))
        .filter(models.PortfolioItem.user_id == current_user.id)
        .order_by(models.PortfolioItem.created_at.desc())
        .all()
    )


@router.post("/items", response_model=schemas.PortfolioItemOut, status_code=status.HTTP_201_CREATED)
def add_portfolio_item(
    payload: schemas.PortfolioItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    card = db.query(models.Card).filter(models.Card.id == payload.card_id).first()
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")

    existing = (
        db.query(models.PortfolioItem)
        .filter(
            models.PortfolioItem.user_id == current_user.id,
            models.PortfolioItem.card_id == payload.card_id,
        )
        .first()
    )
    if existing:
        existing.quantity += payload.quantity
        existing.purchase_price = payload.purchase_price
        db.commit()
        db.refresh(existing)
        return existing

    item = models.PortfolioItem(
        user_id=current_user.id,
        card_id=payload.card_id,
        quantity=payload.quantity,
        purchase_price=payload.purchase_price,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=schemas.PortfolioItemOut)
def update_portfolio_item(
    item_id: int,
    payload: schemas.PortfolioItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = (
        db.query(models.PortfolioItem)
        .filter(models.PortfolioItem.id == item_id, models.PortfolioItem.user_id == current_user.id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Portfolio item not found")

    if payload.quantity is not None:
        item.quantity = payload.quantity
    if payload.purchase_price is not None:
        item.purchase_price = payload.purchase_price

    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portfolio_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = (
        db.query(models.PortfolioItem)
        .filter(models.PortfolioItem.id == item_id, models.PortfolioItem.user_id == current_user.id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Portfolio item not found")

    db.delete(item)
    db.commit()
    return None
