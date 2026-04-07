from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    database: str
    redis: str


class ErrorResponse(BaseModel):
    detail: str
