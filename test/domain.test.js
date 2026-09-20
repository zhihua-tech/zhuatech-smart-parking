import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkingService } from '../src/domain.js';

function fixture() {
  const service = new ParkingService();
  const lot = service.createLot({ code: 'P1', name: '园区停车场', address: '上海', freeMinutes: 30, hourlyRate: 6, dailyCap: 48, graceMinutes: 15 });
  service.addSpaces(lot.id, { prefix: 'A', count: 2 });
  return { service, lot };
}

test('临停车辆完成入场计费支付和离场闭环', () => {
  const { service, lot } = fixture();
  const entryAt = new Date(Date.now() - 125 * 60_000).toISOString();
  const record = service.enter({ lotId: lot.id, plate: '沪A12345', entryAt }, 'gate', 'entry-1');
  assert.equal(service.quote(record.id).payable, 12);
  const payment = service.pay(record.id, { channel: 'wechat' }, 'user', 'pay-1');
  assert.equal(payment.amount, 12);
  const exited = service.exit(record.id);
  assert.equal(exited.status, 'exited');
  assert.equal(service.spaces.get(record.spaceId).status, 'available');
});

test('月卡车辆免单且入场请求幂等', () => {
  const { service, lot } = fixture();
  service.issuePass({ lotId: lot.id, plate: '沪B88888', endAt: new Date(Date.now() + 86400_000).toISOString() });
  const first = service.enter({ lotId: lot.id, plate: '沪B88888' }, 'gate', 'entry-2');
  assert.equal(first.id, service.enter({ lotId: lot.id, plate: '沪B88888' }, 'gate', 'entry-2').id);
  assert.equal(service.quote(first.id).payable, 0);
  assert.equal(service.exit(first.id).status, 'exited');
});

test('商户券减免并且只能核销一次', () => {
  const { service, lot } = fixture();
  const record = service.enter({ lotId: lot.id, plate: '沪C12345', entryAt: new Date(Date.now() - 125 * 60_000).toISOString() });
  service.issueCoupon({ code: 'SHOP60', lotId: lot.id, type: 'minutes', value: 60 });
  assert.equal(service.pay(record.id, { couponCode: 'SHOP60' }).amount, 6);
  assert.equal(service.coupons.get('SHOP60').status, 'used');
});

test('黑名单车辆和满位车辆会被拒绝', () => {
  const { service, lot } = fixture();
  service.blockVehicle('沪D00001', '欠费未处理');
  assert.throws(() => service.enter({ lotId: lot.id, plate: '沪D00001' }), /禁止入场/);
  service.enter({ lotId: lot.id, plate: '沪E00001' });
  service.enter({ lotId: lot.id, plate: '沪E00002' });
  assert.throws(() => service.enter({ lotId: lot.id, plate: '沪E00003' }), /已满/);
});
