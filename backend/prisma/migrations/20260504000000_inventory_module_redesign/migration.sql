-- Inventory module redesign — wipes existing stock data (user-approved clean slate)
-- and adds Product / ProductCategory / Warehouse master tables.

TRUNCATE TABLE "stock_movements" CASCADE;
TRUNCATE TABLE "stock_items" CASCADE;

-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('KG', 'PCS');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('IN', 'USED', 'TRANSFER');

-- DropIndex
DROP INDEX "stock_items_tenant_id_category_idx";

-- DropIndex
DROP INDEX "stock_items_tenant_id_product_type_idx";

-- AlterTable
ALTER TABLE "stock_items" DROP COLUMN "category",
DROP COLUMN "product_type",
DROP COLUMN "weight_kg",
ADD COLUMN     "batch_number" TEXT NOT NULL,
ADD COLUMN     "product_id" TEXT NOT NULL,
ADD COLUMN     "quantity" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "unit" "StockUnit" NOT NULL,
ADD COLUMN     "warehouse_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stock_movements" DROP COLUMN "direction",
ADD COLUMN     "from_warehouse_id" TEXT,
ADD COLUMN     "to_warehouse_id" TEXT,
ADD COLUMN     "type" "MovementType" NOT NULL;

-- DropEnum
DROP TYPE "MovementDirection";

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_unit" "StockUnit" NOT NULL DEFAULT 'KG',
    "reserved_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_categories_tenant_id_idx" ON "product_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_tenant_id_name_key" ON "product_categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "products_tenant_id_category_id_idx" ON "products"("tenant_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_product_code_key" ON "products"("tenant_id", "product_code");

-- CreateIndex
CREATE INDEX "warehouses_tenant_id_idx" ON "warehouses"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_id_name_key" ON "warehouses"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "stock_items_tenant_id_product_id_idx" ON "stock_items"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_items_tenant_id_warehouse_id_idx" ON "stock_items"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "stock_items_tenant_id_batch_number_idx" ON "stock_items"("tenant_id", "batch_number");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
