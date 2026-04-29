import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { authGuard } from './middleware/authGuard.js';
import { rateLimit } from './middleware/rateLimit.js';
import { auditLog } from './middleware/auditLog.js';
import { config } from './config.js';
import { ToolRegistry } from './mcp/toolRegistry.js';
import { dispatch } from './mcp/dispatcher.js';
import { parse, ok, err } from './mcp/transport.js';
import { RpcError } from './mcp/errors.js';
import * as foodSchemas from './schemas/food.js';
import * as grocerySchemas from './schemas/grocery.js';
import { RestaurantService } from './services/food/RestaurantService.js'; import { MenuService } from './services/food/MenuService.js'; import { CartService as FCart } from './services/food/CartService.js'; import { CouponService } from './services/food/CouponService.js'; import { OrderService as FOrder } from './services/food/OrderService.js'; import { TrackingService as FTrack } from './services/food/TrackingService.js';
import { AddressService } from './services/grocery/AddressService.js'; import { ProductService } from './services/grocery/ProductService.js'; import { InventoryService } from './services/grocery/InventoryService.js'; import { CartService as GCart } from './services/grocery/CartService.js'; import { OrderService as GOrder } from './services/grocery/OrderService.js'; import { TrackingService as GTrack } from './services/grocery/TrackingService.js';
import { publishEvent, realtimeBus } from './realtime.js';
const rs=new RestaurantService(),ms=new MenuService(),fcs=new FCart(),cps=new CouponService(),fos=new FOrder(),fts=new FTrack(); const as=new AddressService(),ps=new ProductService(),is=new InventoryService(),gcs=new GCart(),gos=new GOrder(),gts=new GTrack();
const mk=(domain:any,name:string,input:any,handler:any,isMutating=false,requiresConfirmation=false)=>({name,description:`${name} tool`,domain,inputSchema:input,outputSchema:{type:'object'},isMutating,requiresAuth:true,requiresConfirmation,handler});
const wrap=(domain:'food'|'grocery',tool:string,fn:(a:any)=>any,mutating=false)=> (a:any)=>{const result=fn(a); if(mutating) publishEvent({type:tool,domain,payload:result,ts:new Date().toISOString()}); return result;};
const foodTools={
restaurant_search:mk('food','restaurant_search',foodSchemas.restaurantSearchSchema,wrap('food','restaurant_search',(a)=>({restaurants:rs.search(foodSchemas.restaurantSearchSchema.parse(a))}))),
get_restaurant_menu:mk('food','get_restaurant_menu',foodSchemas.menuSchema,wrap('food','get_restaurant_menu',(a)=>({items:ms.getMenu(foodSchemas.menuSchema.parse(a).restaurant_id)}))),
search_menu:mk('food','search_menu',foodSchemas.searchMenuSchema,wrap('food','search_menu',(a)=>{const p=foodSchemas.searchMenuSchema.parse(a); return {items:ms.search(p.restaurant_id,p.query)}})),
create_cart:mk('food','create_cart',foodSchemas.createCartSchema,wrap('food','create_cart',(a)=>fcs.create(foodSchemas.createCartSchema.parse(a).restaurant_id),true),true),
update_cart:mk('food','update_cart',foodSchemas.updateCartSchema,wrap('food','update_cart',(a)=>fcs.update(foodSchemas.updateCartSchema.parse(a)),true),true),
get_cart:mk('food','get_cart',foodSchemas.getCartSchema,wrap('food','get_cart',(a)=>fcs.get(foodSchemas.getCartSchema.parse(a).cart_id))),
fetch_coupons:mk('food','fetch_coupons',grocerySchemas.addrSchema,()=>({coupons:cps.fetch()})),
apply_coupon:mk('food','apply_coupon',foodSchemas.applyCouponSchema,wrap('food','apply_coupon',(a)=>{const p=foodSchemas.applyCouponSchema.parse(a); const c=fcs.get(p.cart_id); if(!c) throw new RpcError('NOT_FOUND','cart not found'); return cps.apply(p.code,c.total);},true),true),
place_order:mk('food','place_order',foodSchemas.placeOrderSchema,wrap('food','place_order',(a)=>{const p=foodSchemas.placeOrderSchema.parse(a); const c=fcs.get(p.cart_id); if(!c) throw new RpcError('NOT_FOUND','cart not found'); return fos.place(c,p.selected_address_id);},true),true,true),
get_orders:mk('food','get_orders',grocerySchemas.addrSchema,()=>({orders:fos.list()})), get_order_details:mk('food','get_order_details',foodSchemas.orderByIdSchema,(a)=>fos.get(foodSchemas.orderByIdSchema.parse(a).order_id)), track_order:mk('food','track_order',foodSchemas.orderByIdSchema,(a)=>fts.track(foodSchemas.orderByIdSchema.parse(a).order_id)), report_error:mk('food','report_error',grocerySchemas.addrSchema,()=>({status:'received'}))
};
const groceryTools={
get_addresses:mk('grocery','get_addresses',grocerySchemas.addrSchema,()=>({addresses:as.list()})),
search_products:mk('grocery','search_products',grocerySchemas.productSearchSchema,(a)=>{const p=grocerySchemas.productSearchSchema.parse(a); if(!as.isServiceable(p.address_id)) return {products:[]}; return {products:ps.search(p.query,p.address_id)}}),
get_product_details:mk('grocery','get_product_details',grocerySchemas.productDetailsSchema,(a)=>ps.details(grocerySchemas.productDetailsSchema.parse(a).product_id)),
get_frequently_bought_items:mk('grocery','get_frequently_bought_items',grocerySchemas.addrSchema,()=>({items:ps.frequently()})),
update_cart:mk('grocery','update_cart',grocerySchemas.gUpdateCartSchema,wrap('grocery','update_cart',(a)=>{const p=grocerySchemas.gUpdateCartSchema.parse(a); let c=gcs.get(p.cart_id); if(!c)c=gcs.create(); const idx=c.items.findIndex((i:any)=>i.product_id===p.product_id); if(p.op==='add'){const q=p.quantity||1; if(!is.check(p.product_id,p.address_id,q)) throw new RpcError('OUT_OF_STOCK','Item out of stock',{substitution:is.substitution(p.product_id)}); if(idx>=0)c.items[idx].qty+=q; else c.items.push({product_id:p.product_id,qty:q,price:is.price(p.product_id)});} if(p.op==='remove'&&idx>=0)c.items.splice(idx,1); if(p.op==='update_qty'&&idx>=0)c.items[idx].qty=p.quantity||0; c.total=c.items.reduce((s:any,i:any)=>s+i.qty*i.price,0); return c;},true),true),
get_cart:mk('grocery','get_cart',grocerySchemas.gGetCartSchema,(a)=>gcs.get(grocerySchemas.gGetCartSchema.parse(a).cart_id)),
clear_cart:mk('grocery','clear_cart',grocerySchemas.gGetCartSchema,wrap('grocery','clear_cart',(a)=>gcs.clear(grocerySchemas.gGetCartSchema.parse(a).cart_id),true),true),
checkout:mk('grocery','checkout',grocerySchemas.checkoutSchema,wrap('grocery','checkout',(a)=>{const p=grocerySchemas.checkoutSchema.parse(a); const c=gcs.get(p.cart_id); if(!c) throw new RpcError('NOT_FOUND','cart not found'); c.items=c.items.map((i:any)=>({...i,price:is.price(i.product_id)})); c.total=c.items.reduce((s:any,i:any)=>s+i.qty*i.price,0); return gos.checkout(c);},true),true,true),
get_orders:mk('grocery','get_orders',grocerySchemas.addrSchema,()=>({orders:gos.list()})), get_order_details:mk('grocery','get_order_details',grocerySchemas.gOrderById,(a)=>gos.get(grocerySchemas.gOrderById.parse(a).order_id)), track_order:mk('grocery','track_order',grocerySchemas.gOrderById,(a)=>gts.track(grocerySchemas.gOrderById.parse(a).order_id)), report_error:mk('grocery','report_error',grocerySchemas.addrSchema,()=>({status:'received'}))
};
const food=new ToolRegistry(foodTools); const grocery=new ToolRegistry(groceryTools);
const combined=new ToolRegistry(Object.fromEntries([...Object.entries(food.tools).map(([k,v])=>[`food.${k}`,{...v,name:`food.${k}`}]),...Object.entries(grocery.tools).map(([k,v])=>[`grocery.${k}`,{...v,name:`grocery.${k}`}])]));
const app=express(); app.use(express.json()); app.use(rateLimit,authGuard,auditLog);
app.get('/health',(_q,r)=>r.json({status:'ok'})); app.get('/version',(_q,r)=>r.json({name:'mcp-commerce-server',version:'1.2.0'})); app.get('/docs',(_q,r)=>r.json({docs:'/docs/index.md'}));
app.get('/llms.txt',(_q,r)=>r.type('text/plain').send(fs.readFileSync(path.join(process.cwd(),'public/llms.txt'),'utf8'))); app.get('/llms-full.txt',(_q,r)=>r.type('text/plain').send(fs.readFileSync(path.join(process.cwd(),'public/llms-full.txt'),'utf8')));
app.get('/events',(req,res)=>{res.setHeader('Content-Type','text/event-stream'); res.setHeader('Cache-Control','no-cache'); res.setHeader('Connection','keep-alive'); const onEvent=(e:any)=>res.write(`data: ${JSON.stringify(e)}\n\n`); realtimeBus.on('event',onEvent); req.on('close',()=>realtimeBus.off('event',onEvent));});
const endpoint=(reg:ToolRegistry)=>async(req:any,res:any)=>{try{const rpc=parse(req.body); if(rpc.method==='tools/list'||rpc.method==='tools/meta') return res.json(ok(rpc.id,{tools:reg.list()})); if(rpc.method==='tools/call') return res.json(ok(rpc.id,await dispatch(reg,rpc.params.name,rpc.params.arguments||{},{}))); throw new RpcError('METHOD_NOT_FOUND','method unsupported');}catch(e:any){res.status(400).json(err(req.body?.id??null,{code:e.code||'VALIDATION_ERROR',message:e.message,details:e.details}));}};
app.post('/mcp/food',endpoint(food)); app.post('/mcp/grocery',endpoint(grocery)); app.post('/mcp/combined',endpoint(combined));
if(process.env.VITEST!=='true') app.listen(config.port,()=>console.log('listening',config.port));
export default app;
