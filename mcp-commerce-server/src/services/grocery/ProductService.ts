import { products } from '../../mocks/groceryData.js';
export class ProductService{search(query:string,address_id:string){return products.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())&&(p.stockByAddress as any)[address_id]>0);} details(id:string){return products.find(p=>p.id===id);} frequently(){return products.slice(0,2);} }
