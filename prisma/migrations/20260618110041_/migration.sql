-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('WITH_PRESCRIPTION', 'WITHOUT_PRESCRIPTION');

-- CreateEnum
CREATE TYPE "DeliveryPlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SHIPPED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('LOGILESS_INVENTORY', 'FBA_INVENTORY', 'SALES_DATA', 'BUSINESS_REPORT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "product_categories" (
    "product_category_id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_category_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_master_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "asin" TEXT,
    "parent_asin" TEXT,
    "logiless_product_code" TEXT,
    "logiless_article_id" INTEGER,
    "product_type" "ProductType" NOT NULL,
    "fba_stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "upper_limit" INTEGER,
    "fba_stock_synced_at" TIMESTAMP(3),
    "fba_open_po_quantity" INTEGER,
    "upper_limit_updated_at" TIMESTAMP(3),
    "upper_limit_note" TEXT,
    "logiless_stock_reserve" INTEGER NOT NULL DEFAULT 25,
    "stock_upper_limit" INTEGER,
    "business_1y" DOUBLE PRECISION,
    "business_3m" DOUBLE PRECISION,
    "sales_data_synced_at" TIMESTAMP(3),
    "next_arrival_date" TIMESTAMP(3),
    "next_arrival_quantity" INTEGER,
    "is_discontinued" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_master_id")
);

-- CreateTable
CREATE TABLE "logiless_inventories" (
    "logiless_inventory_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "location" TEXT,
    "lot_number" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "expiry_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logiless_inventories_pkey" PRIMARY KEY ("logiless_inventory_id")
);

-- CreateTable
CREATE TABLE "delivery_plans" (
    "delivery_plan_id" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "logiless_order_code" TEXT,
    "sp_api_shipment_id" TEXT,
    "shipment_date" TIMESTAMP(3),
    "status" "DeliveryPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_plans_pkey" PRIMARY KEY ("delivery_plan_id")
);

-- CreateTable
CREATE TABLE "delivery_plan_items" (
    "delivery_plan_item_id" TEXT NOT NULL,
    "delivery_plan_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "planned_quantity" INTEGER NOT NULL,
    "lot_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_plan_items_pkey" PRIMARY KEY ("delivery_plan_item_id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "type" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_check_results" (
    "id" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_count" INTEGER NOT NULL,
    "data" TEXT NOT NULL,

    CONSTRAINT "inventory_check_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_end_positions" (
    "calculation_end_position_id" TEXT NOT NULL,
    "product_type" "ProductType" NOT NULL,
    "category_name" TEXT,
    "color_name" TEXT,
    "last_sku" TEXT,
    "deferred_color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculation_end_positions_pkey" PRIMARY KEY ("calculation_end_position_id")
);

-- CreateTable
CREATE TABLE "fba_inactive_listings" (
    "fba_inactive_listing_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "asin" TEXT,
    "item_name" TEXT,
    "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fba_inactive_listings_pkey" PRIMARY KEY ("fba_inactive_listing_id")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_logiless_article_id_key" ON "products"("logiless_article_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_plans_logiless_order_code_key" ON "delivery_plans"("logiless_order_code");

-- CreateIndex
CREATE UNIQUE INDEX "calculation_end_positions_product_type_key" ON "calculation_end_positions"("product_type");

-- CreateIndex
CREATE UNIQUE INDEX "fba_inactive_listings_sku_key" ON "fba_inactive_listings"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_provider_key" ON "oauth_tokens"("provider");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("product_category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logiless_inventories" ADD CONSTRAINT "logiless_inventories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_master_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_plan_items" ADD CONSTRAINT "delivery_plan_items_delivery_plan_id_fkey" FOREIGN KEY ("delivery_plan_id") REFERENCES "delivery_plans"("delivery_plan_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_plan_items" ADD CONSTRAINT "delivery_plan_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_master_id") ON DELETE RESTRICT ON UPDATE CASCADE;
