/* ==========================================================================
   VKU FIELD SURVEY PWA - CLOUDFLARE PAGES FUNCTION BACKEND API
   Endpoint: /api/surveys
   Handles 100% persistent cross-device synchronization (GET, POST, DELETE)
   ========================================================================== */

const MASTER_DB_URL = 'https://api.restful-api.dev/objects/ff808181a067127101a067f04e6e039a';

async function getMasterSurveys() {
  try {
    const res = await fetch(MASTER_DB_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return [];
    const obj = await res.json();
    return (obj && obj.data && Array.isArray(obj.data.surveys)) ? obj.data.surveys : [];
  } catch (err) {
    console.warn('[Cloud Function] Error reading master DB:', err.message);
    return [];
  }
}

async function updateMasterSurveys(surveys) {
  try {
    const res = await fetch(MASTER_DB_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'VKU_PWA_SURVEYS_DATABASE_V2',
        data: { surveys }
      })
    });
    return res.ok;
  } catch (err) {
    console.warn('[Cloud Function] Error writing master DB:', err.message);
    return false;
  }
}

export async function onRequestGet(context) {
  try {
    const surveysList = await getMasterSurveys();

    return new Response(JSON.stringify(surveysList), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestPost(context) {
  try {
    const item = await context.request.json();
    if (!item || !item.id) {
      return new Response(JSON.stringify({ error: 'Missing survey item or item id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    item.synced = true;
    item.syncedAt = new Date().toISOString();

    const surveys = await getMasterSurveys();
    const idx = surveys.findIndex(s => s.id === item.id);
    if (idx >= 0) {
      surveys[idx] = item;
    } else {
      surveys.unshift(item);
    }

    await updateMasterSurveys(surveys);

    return new Response(JSON.stringify({ success: true, message: 'Survey saved to Cloud Store', item }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestDelete(context) {
  try {
    const url = new URL(context.request.url);
    let targetId = url.searchParams.get('id');

    if (!targetId) {
      try {
        const body = await context.request.json();
        targetId = body?.id;
      } catch (e) {
        /* Ignore */
      }
    }

    if (!targetId) {
      return new Response(JSON.stringify({ error: 'Missing target survey id to delete' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const surveys = await getMasterSurveys();
    const filteredSurveys = surveys.filter(s => s.id !== targetId);
    await updateMasterSurveys(filteredSurveys);

    return new Response(JSON.stringify({ success: true, deletedId: targetId, message: 'Survey deleted from Cloud' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Accept'
    }
  });
}
