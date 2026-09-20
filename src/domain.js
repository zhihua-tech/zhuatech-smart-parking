/**
 * 上海如静知华信息科技有限公司 https://www.zhuatech.cn/
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
import crypto from 'node:crypto';

const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
const clone = (value) => structuredClone(value);
const required = (value, field) => {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`${field}不能为空`);
  return String(value).trim().toUpperCase();
};

/**
 * 智慧停车领域服务，覆盖车场、车位、车辆通行、预约、月卡、优惠、计费、支付和对账。
 * 上海如静知华信息科技有限公司：https://www.zhuatech.cn/
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
export class ParkingService {
  constructor(seed = {}) {
    this.lots = new Map((seed.lots || []).map((item) => [item.id, item]));
    this.spaces = new Map((seed.spaces || []).map((item) => [item.id, item]));
    this.records = new Map((seed.records || []).map((item) => [item.id, item]));
    this.passes = new Map((seed.passes || []).map((item) => [item.id, item]));
    this.reservations = new Map((seed.reservations || []).map((item) => [item.id, item]));
    this.coupons = new Map((seed.coupons || []).map((item) => [item.code, item]));
    this.blacklist = new Map((seed.blacklist || []).map((item) => [item.plate, item]));
    this.payments = seed.payments || [];
    this.audit = seed.audit || [];
    this.requests = new Map(seed.requests || []);
  }

  /**
   * 建立停车场并配置免费时长、小时费率、封顶金额和离场宽限期。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  createLot(input, actor = 'admin') {
    const code = required(input.code, '停车场编码');
    if ([...this.lots.values()].some((item) => item.code === code)) throw new Error('停车场编码已存在');
    const lot = {
      id: uid('lot'), code, name: required(input.name, '停车场名称'), address: required(input.address, '停车场地址'),
      freeMinutes: Math.max(0, Number(input.freeMinutes || 15)), hourlyRate: Number(input.hourlyRate || 6),
      dailyCap: Number(input.dailyCap || 60), graceMinutes: Number(input.graceMinutes || 15), status: 'active', createdAt: now()
    };
    if (lot.hourlyRate <= 0 || lot.dailyCap <= 0) throw new Error('费率必须大于0');
    this.lots.set(lot.id, lot);
    this.#record(actor, 'LOT_CREATED', lot.id, { code });
    return clone(lot);
  }

  /**
   * 批量生成停车位，支持普通、充电和无障碍车位类型。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  addSpaces(lotId, input, actor = 'operator') {
    if (!this.lots.has(lotId)) throw new Error('停车场不存在');
    const count = Number(input.count);
    if (!Number.isInteger(count) || count <= 0 || count > 5000) throw new Error('车位数量无效');
    const prefix = required(input.prefix || 'A', '车位前缀');
    const created = [];
    for (let index = 1; index <= count; index += 1) {
      const code = `${prefix}-${String(index).padStart(3, '0')}`;
      if ([...this.spaces.values()].some((item) => item.lotId === lotId && item.code === code)) continue;
      const space = { id: uid('spc'), lotId, code, type: input.type || 'standard', status: 'available', plate: null, updatedAt: now() };
      this.spaces.set(space.id, space);
      created.push(space);
    }
    this.#record(actor, 'SPACES_ADDED', lotId, { count: created.length });
    return clone(created);
  }

  /**
   * 创建车辆月卡，生效期间免收临停费用并保留完整通行记录。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  issuePass(input, actor = 'cashier') {
    if (!this.lots.has(input.lotId)) throw new Error('停车场不存在');
    const plate = required(input.plate, '车牌号');
    const startAt = input.startAt || now();
    const endAt = required(input.endAt, '有效期截止时间');
    if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error('月卡截止时间必须晚于开始时间');
    const pass = { id: uid('pas'), lotId: input.lotId, plate, ownerName: input.ownerName || '', startAt, endAt, status: 'active', createdAt: now() };
    this.passes.set(pass.id, pass);
    this.#record(actor, 'PASS_ISSUED', pass.id, { plate });
    return clone(pass);
  }

  /**
   * 预约指定类型车位并锁定资源，过期预约可在入场时自动释放。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  reserve(input, actor = 'customer') {
    const plate = required(input.plate, '车牌号');
    if (!this.lots.has(input.lotId)) throw new Error('停车场不存在');
    const space = [...this.spaces.values()].find((item) => item.lotId === input.lotId && item.status === 'available' && (!input.spaceType || item.type === input.spaceType));
    if (!space) throw new Error('没有可预约车位');
    const expiresAt = input.expiresAt || new Date(Date.now() + 30 * 60_000).toISOString();
    const reservation = { id: uid('rsv'), lotId: input.lotId, spaceId: space.id, plate, status: 'active', expiresAt, createdAt: now() };
    space.status = 'reserved';
    space.plate = plate;
    this.reservations.set(reservation.id, reservation);
    this.#record(actor, 'SPACE_RESERVED', reservation.id, { plate, spaceId: space.id });
    return clone(reservation);
  }

  /**
   * 处理车辆入场，执行黑名单、重复入场、预约核销和车位自动分配校验。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  enter(input, actor = 'gate', idempotencyKey = '') {
    if (idempotencyKey && this.requests.has(idempotencyKey)) return clone(this.records.get(this.requests.get(idempotencyKey)));
    const lot = this.lots.get(input.lotId);
    const plate = required(input.plate, '车牌号');
    if (!lot || lot.status !== 'active') throw new Error('停车场不可用');
    if (this.blacklist.has(plate)) throw new Error(`车辆禁止入场：${this.blacklist.get(plate).reason}`);
    if ([...this.records.values()].some((item) => item.plate === plate && item.status === 'parked')) throw new Error('车辆已在场内');
    let reservation = [...this.reservations.values()].find((item) => item.lotId === lot.id && item.plate === plate && item.status === 'active');
    if (reservation && Date.parse(reservation.expiresAt) <= Date.now()) {
      this.spaces.get(reservation.spaceId).status = 'available';
      this.spaces.get(reservation.spaceId).plate = null;
      reservation.status = 'expired';
      reservation = null;
    }
    const space = reservation ? this.spaces.get(reservation.spaceId) : [...this.spaces.values()].find((item) => item.lotId === lot.id && item.status === 'available');
    if (!space) throw new Error('停车场已满');
    if (reservation) reservation.status = 'consumed';
    space.status = 'occupied';
    space.plate = plate;
    const record = {
      id: uid('rec'), lotId: lot.id, spaceId: space.id, plate, entryGate: input.gate || '入口', entryAt: input.entryAt || now(),
      status: 'parked', fee: 0, discount: 0, payable: 0, paidAt: null, exitAt: null, createdAt: now()
    };
    this.records.set(record.id, record);
    if (idempotencyKey) this.requests.set(idempotencyKey, record.id);
    this.#record(actor, 'VEHICLE_ENTERED', record.id, { plate, space: space.code });
    return clone(record);
  }

  /**
   * 创建一次性商户停车优惠券，支持减免分钟数或固定金额。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  issueCoupon(input, actor = 'merchant') {
    const code = required(input.code, '优惠码');
    if (this.coupons.has(code)) throw new Error('优惠码已存在');
    const coupon = { code, lotId: input.lotId, type: input.type || 'minutes', value: Number(input.value || 0), status: 'active', expiresAt: input.expiresAt || null, createdAt: now() };
    if (coupon.value <= 0) throw new Error('优惠值必须大于0');
    this.coupons.set(code, coupon);
    this.#record(actor, 'COUPON_ISSUED', code, { type: coupon.type, value: coupon.value });
    return clone(coupon);
  }

  /**
   * 计算当前停车费用，按24小时周期封顶并叠加月卡与商户优惠规则。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  quote(recordId, at = now(), couponCode = '') {
    const record = this.records.get(recordId);
    if (!record || !['parked', 'paid'].includes(record.status)) throw new Error('停车记录不存在或已离场');
    const lot = this.lots.get(record.lotId);
    const minutes = Math.max(0, Math.ceil((Date.parse(at) - Date.parse(record.entryAt)) / 60_000));
    const pass = [...this.passes.values()].find((item) => item.lotId === record.lotId && item.plate === record.plate && item.status === 'active' && Date.parse(item.startAt) <= Date.parse(at) && Date.parse(item.endAt) >= Date.parse(at));
    if (pass) return { recordId, minutes, fee: 0, discount: 0, payable: 0, reason: 'monthly-pass' };
    const billableMinutes = Math.max(0, minutes - lot.freeMinutes);
    const days = Math.floor(billableMinutes / 1440);
    const remainder = billableMinutes % 1440;
    let fee = days * lot.dailyCap + Math.min(lot.dailyCap, Math.ceil(remainder / 60) * lot.hourlyRate);
    let discount = 0;
    if (couponCode) {
      const coupon = this.coupons.get(required(couponCode, '优惠码'));
      if (!coupon || coupon.status !== 'active' || coupon.lotId !== record.lotId || (coupon.expiresAt && Date.parse(coupon.expiresAt) < Date.parse(at))) throw new Error('优惠码无效');
      discount = coupon.type === 'amount' ? coupon.value : Math.ceil(coupon.value / 60) * lot.hourlyRate;
    }
    fee = Number(fee.toFixed(2));
    return { recordId, minutes, fee, discount: Math.min(fee, discount), payable: Number(Math.max(0, fee - discount).toFixed(2)), reason: 'temporary' };
  }

  /**
   * 支付停车订单，锁定金额并核销一次性优惠券，重复请求返回同一支付结果。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  pay(recordId, input, actor = 'customer', idempotencyKey = '') {
    if (idempotencyKey && this.requests.has(`pay:${idempotencyKey}`)) return clone(this.payments.find((item) => item.id === this.requests.get(`pay:${idempotencyKey}`)));
    const record = this.records.get(recordId);
    if (!record || record.status !== 'parked') throw new Error('停车记录不可支付');
    const quote = this.quote(recordId, input.paidAt || now(), input.couponCode || '');
    const payment = { id: uid('pay'), recordId, channel: input.channel || 'wechat', amount: quote.payable, status: 'success', paidAt: input.paidAt || now(), tradeNo: input.tradeNo || uid('txn') };
    record.fee = quote.fee;
    record.discount = quote.discount;
    record.payable = quote.payable;
    record.paidAt = payment.paidAt;
    record.status = 'paid';
    if (input.couponCode) this.coupons.get(required(input.couponCode, '优惠码')).status = 'used';
    this.payments.push(payment);
    if (idempotencyKey) this.requests.set(`pay:${idempotencyKey}`, payment.id);
    this.#record(actor, 'PARKING_PAID', record.id, { amount: payment.amount, channel: payment.channel });
    return clone(payment);
  }

  /**
   * 办理车辆离场，校验支付状态及支付后宽限时间并释放车位。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  exit(recordId, input = {}, actor = 'gate') {
    const record = this.records.get(recordId);
    if (!record || !['parked', 'paid'].includes(record.status)) throw new Error('停车记录不存在或已离场');
    const at = input.exitAt || now();
    const quote = this.quote(recordId, at);
    if (record.status === 'parked' && quote.payable > 0) throw new Error('停车费尚未支付');
    if (record.status === 'paid') {
      const grace = this.lots.get(record.lotId).graceMinutes;
      if (Date.parse(at) - Date.parse(record.paidAt) > grace * 60_000) throw new Error('支付后离场超时，需要补缴');
    }
    record.status = 'exited';
    record.exitAt = at;
    record.exitGate = input.gate || '出口';
    const space = this.spaces.get(record.spaceId);
    space.status = 'available';
    space.plate = null;
    space.updatedAt = now();
    this.#record(actor, 'VEHICLE_EXITED', record.id, { plate: record.plate });
    return clone(record);
  }

  /**
   * 将车辆加入黑名单并记录原因与操作审计。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  blockVehicle(plateValue, reason, actor = 'security') {
    const plate = required(plateValue, '车牌号');
    const item = { plate, reason: required(reason, '拦截原因'), createdAt: now(), actor };
    this.blacklist.set(plate, item);
    this.#record(actor, 'VEHICLE_BLOCKED', plate, { reason: item.reason });
    return clone(item);
  }

  /**
   * 汇总利用率、在场车辆、收入、可用车位和最近通行记录。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  dashboard() {
    const spaces = [...this.spaces.values()];
    const records = [...this.records.values()];
    return {
      metrics: {
        lots: this.lots.size, spaces: spaces.length, available: spaces.filter((item) => item.status === 'available').length,
        occupied: spaces.filter((item) => item.status === 'occupied').length,
        utilization: spaces.length ? Number((spaces.filter((item) => item.status === 'occupied').length / spaces.length * 100).toFixed(1)) : 0,
        revenue: Number(this.payments.reduce((sum, item) => sum + item.amount, 0).toFixed(2)), parked: records.filter((item) => item.status === 'parked').length
      },
      lots: [...this.lots.values()], spaces, records: records.slice(-20).reverse(), payments: this.payments.slice(-20).reverse(), audit: this.audit.slice(-30).reverse()
    };
  }

  /**
   * 导出停车业务快照用于持久化和数据恢复。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  dump() {
    return {
      lots: [...this.lots.values()], spaces: [...this.spaces.values()], records: [...this.records.values()], passes: [...this.passes.values()],
      reservations: [...this.reservations.values()], coupons: [...this.coupons.values()], blacklist: [...this.blacklist.values()],
      payments: this.payments, audit: this.audit, requests: [...this.requests.entries()]
    };
  }

  #record(actor, action, resourceId, detail) {
    this.audit.push({ id: uid('aud'), actor, action, resourceId, detail, occurredAt: now() });
  }
}

/**
 * 构造包含临停、月卡、预约与支付数据的演示停车场。
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
export function createDemoService() {
  const service = new ParkingService();
  const lot = service.createLot({ code: 'SH-PARK-01', name: '知华科技园区停车场', address: '上海市园区路88号', freeMinutes: 30, hourlyRate: 6, dailyCap: 48 });
  service.addSpaces(lot.id, { prefix: 'A', count: 18 });
  service.addSpaces(lot.id, { prefix: 'E', count: 4, type: 'ev' });
  service.issuePass({ lotId: lot.id, plate: '沪A88888', ownerName: '园区企业用户', endAt: new Date(Date.now() + 30 * 86400_000).toISOString() });
  const record = service.enter({ lotId: lot.id, plate: '沪B12345', gate: '东门入口', entryAt: new Date(Date.now() - 125 * 60_000).toISOString() }, 'demo', 'entry-demo');
  service.issueCoupon({ code: 'SHOP20', lotId: lot.id, type: 'minutes', value: 60 });
  service.pay(record.id, { couponCode: 'SHOP20', channel: 'wechat' }, 'demo', 'pay-demo');
  service.enter({ lotId: lot.id, plate: '沪A88888', gate: '南门入口' }, 'demo');
  return service;
}
