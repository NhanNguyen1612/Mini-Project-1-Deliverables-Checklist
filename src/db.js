import Dexie from 'dexie';

export const db = new Dexie('VKUSurveyOfflineDB');

db.version(4).stores({
  offline_inspections: '++id, request_id, user_id, user_email, facility_name, description, category_ratings, status, image_url, latitude, longitude, location_address, created_at',
  cloud_inspections: '++id, request_id, user_id, user_email, facility_name, description, category_ratings, status, image_url, latitude, longitude, location_address, created_at',
  survey_requests: '++id, teacher_email, title, facility_name, categories, created_at'
});
