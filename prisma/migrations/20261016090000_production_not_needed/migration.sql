-- Ready-stock orders: sales deliver without production (2026-10-16).
ALTER TYPE "ProductionStatus" ADD VALUE IF NOT EXISTS 'NOT_NEEDED';
