import { restaurants } from '../../mocks/foodData.js';
export class RestaurantService{search(q:any){return restaurants.filter(r=>(!q.query||r.name.toLowerCase().includes(q.query.toLowerCase()))&&(!q.cuisine||r.cuisine===q.cuisine)&&(!q.min_rating||r.rating>=q.min_rating)&&(!q.max_delivery_time||r.delivery_time<=q.max_delivery_time));}}
