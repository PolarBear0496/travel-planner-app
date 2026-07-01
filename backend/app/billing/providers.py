from dataclasses import dataclass
from hashlib import sha256
from hmac import compare_digest, new
from uuid import uuid4


@dataclass(frozen=True)
class PlanDefinition:
    name: str
    amount: int
    currency: str
    generation_limit: int


@dataclass(frozen=True)
class CheckoutSession:
    provider: str
    checkout_id: str
    checkout_url: str
    amount: int
    currency: str


@dataclass(frozen=True)
class BillingEvent:
    event_id: str
    provider: str
    provider_payment_id: str
    status: str
    user_id: str
    plan: str


PLAN_DEFINITIONS = {
    "free": PlanDefinition(name="free", amount=0, currency="JPY", generation_limit=10),
    "plus": PlanDefinition(name="plus", amount=980, currency="JPY", generation_limit=100),
    "pro": PlanDefinition(name="pro", amount=2980, currency="JPY", generation_limit=500),
}


class BillingProvider:
    provider_name: str

    def __init__(self, webhook_secret: str | None = None) -> None:
        self.webhook_secret = webhook_secret

    def create_checkout(self, user_id: str, plan: PlanDefinition) -> CheckoutSession:
        checkout_id = uuid4().hex
        return CheckoutSession(
            provider=self.provider_name,
            checkout_id=checkout_id,
            checkout_url=f"https://sandbox.example.invalid/{self.provider_name}/checkout/{checkout_id}",
            amount=plan.amount,
            currency=plan.currency,
        )

    def verify_webhook(self, body: bytes, signature: str | None) -> bool:
        if not self.webhook_secret or not signature:
            return False

        digest = new(
            self.webhook_secret.encode("utf-8"),
            body,
            sha256,
        ).hexdigest()
        return compare_digest(digest, signature)


class PayPayProvider(BillingProvider):
    provider_name = "paypay"


class SquareProvider(BillingProvider):
    provider_name = "square"


def get_plan_definition(plan: str) -> PlanDefinition | None:
    return PLAN_DEFINITIONS.get(plan)
