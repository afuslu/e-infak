#!/bin/bash

# Create initial migration
cd services/backend
alembic revision --autogenerate -m "Initial schema"
echo "✅ Migration created successfully"
