# API 摘要

所有管理和业务接口使用 `x-api-key`，岗亭设备也可以通过 `x-gate-token` 接入。错误统一返回 `{error,message}`。

- `GET /api/dashboard`：车位、在场车辆、利用率和收入；
- `POST /api/lots`：创建停车场；
- `POST /api/lots/{id}/spaces`：批量生成车位；
- `POST /api/passes`：签发月卡；
- `POST /api/reservations`：预约车位；
- `POST /api/entries`：车辆入场，支持 `Idempotency-Key`；
- `GET /api/records/{id}/quote`：停车费用试算；
- `POST /api/records/{id}/pay`：停车支付；
- `POST /api/records/{id}/exit`：车辆离场；
- `POST /api/coupons`：创建商户优惠；
- `POST /api/blacklist`：车辆黑名单。

生产环境应由支付回调确认支付，不要信任车主端直接传入的支付成功状态。
