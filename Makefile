.PHONY: dev down logs migrate seed test

dev:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-celery:
	docker compose logs -f celery-worker-processing celery-worker-evaluation

migrate:
	docker compose exec backend alembic upgrade head

migrate-create:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

shell:
	docker compose exec backend python -c "import app; print('Backend shell ready')"

db-shell:
	docker compose exec postgres psql -U ragcheck ragcheck

redis-shell:
	docker compose exec redis redis-cli

health:
	curl -s http://localhost:8000/api/health | python3 -m json.tool

reset-db:
	docker compose down -v
	docker compose up -d postgres redis
	sleep 3
	docker compose up -d --build
