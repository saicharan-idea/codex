import { z } from 'zod'; import { Confirmation, Id } from './common.js';
export const addrSchema=z.object({});
export const productSearchSchema=z.object({address_id:Id,query:z.string().min(1)});
export const productDetailsSchema=z.object({address_id:Id,product_id:Id});
export const gUpdateCartSchema=z.object({cart_id:Id,op:z.enum(['add','remove','update_qty']),product_id:Id,quantity:z.number().int().min(0).max(20).optional(),address_id:Id});
export const gGetCartSchema=z.object({cart_id:Id,address_id:Id});
export const checkoutSchema=z.object({cart_id:Id,address_id:Id,user_confirmation:Confirmation,selected_address_id:Id});
export const gOrderById=z.object({order_id:Id});
