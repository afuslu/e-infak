.PHONY: help install dev build clean docker-up docker-down migrate seed

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install all dependencies
	pnpm install
	cd services/backend && pip install -r requirements.txt

dev: ## Start development servers
	docker-compose up -d postgres redis
	@echo "Waiting for databases..."
	@sleep 3
	@echo "Starting backend..."
	cd services/backend && uvicorn app.main:app --reload &
	@echo "Starting frontend..."
	pnpm --filter web dev

build: ## Build all packages
	pnpm build

clean: ## Clean build artifacts and dependencies
	pnpm clean
	rm -rf node_modules
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +

docker-up: ## Start all services with Docker
	docker-compose up -d

docker-down: ## Stop all Docker services
	docker-compose down

docker-logs: ## Show Docker logs
	docker-compose logs -f

migrate: ## Run database migrations
	cd services/backend && alembic upgrade head

migrate-create: ## Create new migration
	cd services/backend && alembic revision --autogenerate -m "$(message)"

seed: ## Seed demo data
	python scripts/seed_data.py

test: ## Run tests
	cd services/backend && pytest
	pnpm --filter web test

lint: ## Run linters
	pnpm lint
	cd services/backend && flake8 app

format: ## Format code
	pnpm format
	cd services/backend && black app

db-reset: ## Reset database (WARNING: deletes all data)
	docker-compose down -v
	docker-compose up -d postgres redis
	@sleep 3
	make migrate
	make seed
