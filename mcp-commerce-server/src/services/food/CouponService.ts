import { coupons } from '../../mocks/foodData.js';
export class CouponService{fetch(){return coupons;} apply(code:string,total:number){const c=coupons.find(x=>x.code===code); if(!c) throw new Error('invalid coupon'); if(total<c.minTotal) throw new Error('coupon not eligible'); return {discount:c.discount,finalTotal:total-c.discount};}}
