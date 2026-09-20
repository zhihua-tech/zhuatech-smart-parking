-- 上海如静知华信息科技有限公司 https://www.zhuatech.cn/
-- 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
CREATE DATABASE IF NOT EXISTS zhuatech_smart_parking DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE zhuatech_smart_parking;

CREATE TABLE parking_lot (id VARCHAR(32) PRIMARY KEY, code VARCHAR(64) NOT NULL UNIQUE, name VARCHAR(128) NOT NULL, address VARCHAR(255) NOT NULL, free_minutes INT NOT NULL, hourly_rate DECIMAL(12,2) NOT NULL, daily_cap DECIMAL(12,2) NOT NULL, grace_minutes INT NOT NULL, status VARCHAR(24) NOT NULL, created_at DATETIME(3) NOT NULL);
CREATE TABLE parking_space (id VARCHAR(32) PRIMARY KEY, lot_id VARCHAR(32) NOT NULL, code VARCHAR(32) NOT NULL, space_type VARCHAR(24) NOT NULL, status VARCHAR(24) NOT NULL, plate VARCHAR(32), version BIGINT NOT NULL DEFAULT 0, updated_at DATETIME(3) NOT NULL, UNIQUE KEY uk_space(lot_id,code), INDEX idx_space_available(lot_id,status));
CREATE TABLE parking_record (id VARCHAR(32) PRIMARY KEY, lot_id VARCHAR(32) NOT NULL, space_id VARCHAR(32) NOT NULL, plate VARCHAR(32) NOT NULL, entry_gate VARCHAR(64), entry_at DATETIME(3) NOT NULL, exit_gate VARCHAR(64), exit_at DATETIME(3), status VARCHAR(24) NOT NULL, fee DECIMAL(12,2) NOT NULL, discount DECIMAL(12,2) NOT NULL, payable DECIMAL(12,2) NOT NULL, paid_at DATETIME(3), created_at DATETIME(3) NOT NULL, INDEX idx_record_plate_status(plate,status), INDEX idx_record_lot_entry(lot_id,entry_at));
CREATE TABLE parking_pass (id VARCHAR(32) PRIMARY KEY, lot_id VARCHAR(32) NOT NULL, plate VARCHAR(32) NOT NULL, owner_name VARCHAR(64), start_at DATETIME(3) NOT NULL, end_at DATETIME(3) NOT NULL, status VARCHAR(24) NOT NULL, INDEX idx_pass_plate(lot_id,plate,status));
CREATE TABLE space_reservation (id VARCHAR(32) PRIMARY KEY, lot_id VARCHAR(32) NOT NULL, space_id VARCHAR(32) NOT NULL, plate VARCHAR(32) NOT NULL, status VARCHAR(24) NOT NULL, expires_at DATETIME(3) NOT NULL, created_at DATETIME(3) NOT NULL);
CREATE TABLE parking_coupon (code VARCHAR(64) PRIMARY KEY, lot_id VARCHAR(32) NOT NULL, coupon_type VARCHAR(24) NOT NULL, coupon_value DECIMAL(12,2) NOT NULL, status VARCHAR(24) NOT NULL, expires_at DATETIME(3), created_at DATETIME(3) NOT NULL);
CREATE TABLE parking_payment (id VARCHAR(32) PRIMARY KEY, record_id VARCHAR(32) NOT NULL, channel VARCHAR(24) NOT NULL, amount DECIMAL(12,2) NOT NULL, status VARCHAR(24) NOT NULL, trade_no VARCHAR(128) NOT NULL UNIQUE, paid_at DATETIME(3) NOT NULL);
CREATE TABLE vehicle_blacklist (plate VARCHAR(32) PRIMARY KEY, reason VARCHAR(255) NOT NULL, actor VARCHAR(64) NOT NULL, created_at DATETIME(3) NOT NULL);
CREATE TABLE audit_event (id VARCHAR(32) PRIMARY KEY, actor VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL, resource_id VARCHAR(64) NOT NULL, detail JSON, occurred_at DATETIME(3) NOT NULL);
