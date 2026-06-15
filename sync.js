import { supabase }        from './supabase.js';
import {
  getUnsyncedSurveys, getUnsyncedFanEvents,
  getPhotosForSurvey,
  saveSurvey, saveFanEvent,
} from './db.js';
import { STATIONS, calcQ, effectiveMinQ } from '../data/stations.js';

/**
 * Sync all unsynced surveys and fan events to Supabase.
 * @param {function} onProgress  - callback(message) for UI progress text
 * @returns {{ synced: number, errors: string[] }}
 */
export const syncAll = async (onProgress = () => {}) => {
  const errors = [];
  let synced = 0;

  // ── Surveys ────────────────────────────────────────────────────────────────
  const surveys = await getUnsyncedSurveys();
  for (const sv of surveys) {
    try {
      onProgress(`Uploading survey ${sv.date}…`);

      // 1. Upsert survey row
      const { data: svRow, error: svErr } = await supabase
        .from('vent_surveys')
        .upsert({ local_id: sv.id, survey_date: sv.date, surveyor: sv.surveyor, weather: sv.weather || null },
                 { onConflict: 'local_id' })
        .select('id').single();
      if (svErr) throw svErr;
      const surveyDbId = svRow.id;

      // 2. Readings + defects
      for (const r of sv.readings) {
        const stn = STATIONS.find(s => s.id === r.sid);
        if (!stn) continue;
        const q   = calcQ(r.vel, stn.csa, r.csaOv);
        const mQ  = effectiveMinQ(stn, r.act);

        const { data: rdRow, error: rdErr } = await supabase
          .from('vent_readings')
          .upsert({
            survey_id:    surveyDbId,
            station_id:   r.sid,
            station_name: stn.loc,
            velocity:     r.vel  ? parseFloat(r.vel)  : null,
            csa:          stn.csa,
            csa_override: r.csaOv ? parseFloat(r.csaOv) : null,
            q_actual:     q,
            q_min:        mQ,
            pressure:     r.bar ? parseFloat(r.bar) : null,
            db_temp:      r.db  ? parseFloat(r.db)  : null,
            wb_temp:      r.wb  ? parseFloat(r.wb)  : null,
            gas_o2:       r.o2  ? parseFloat(r.o2)  : null,
            gas_co:       r.co  ? parseFloat(r.co)  : null,
            gas_co2:      r.co2 ? parseFloat(r.co2) : null,
            gas_no2:      r.no2 ? parseFloat(r.no2) : null,
            gas_h2s:      r.h2s ? parseFloat(r.h2s) : null,
            activity:     r.act,
            comments:     r.cmt || null,
            compliant:    q !== null ? q >= mQ : null,
            completed:    r.done,
          },
          { onConflict: 'survey_id,station_id' })
          .select('id').single();
        if (rdErr) throw rdErr;
        const readingDbId = rdRow.id;

        // Defects
        for (const d of r.defects || []) {
          const { error: dErr } = await supabase.from('vent_defects').upsert({
            local_id:     d.id,
            survey_id:    surveyDbId,
            reading_id:   readingDbId,
            station_name: stn.loc,
            defect_type:  d.type,
            priority:     d.priority,
            notes:        d.note || null,
            assigned_to:  'Barminco foreperson',
          }, { onConflict: 'local_id' });
          if (dErr) console.warn('[sync] defect upsert:', dErr.message);
        }
      }

      // 3. Upload photos from IndexedDB → Supabase Storage
      onProgress(`Uploading photos for ${sv.date}…`);
      const photos = await getPhotosForSurvey(sv.id);
      for (const photo of photos) {
        if (!photo.data) continue;
        try {
          const [meta, b64] = photo.data.split(',');
          const mime        = meta.match(/:(.*?);/)[1];
          const ext         = mime.split('/')[1];
          const path        = `${surveyDbId}/${photo.stationId}/${photo.id}.${ext}`;

          // base64 → Uint8Array
          const binary = atob(b64);
          const bytes  = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

          const { error: stErr } = await supabase.storage
            .from('vent-photos')
            .upload(path, bytes, { contentType: mime, upsert: true });
          if (stErr) console.warn('[sync] photo upload:', stErr.message);

          // Record in vent_photos table
          await supabase.from('vent_photos').upsert({
            local_id:      photo.id,
            survey_id:     surveyDbId,
            station_id:    photo.stationId,
            storage_path:  path,
            original_name: photo.name,
          }, { onConflict: 'local_id' });
        } catch (photoErr) {
          console.warn('[sync] photo error:', photoErr);
        }
      }

      // 4. Mark survey as synced locally
      await saveSurvey({ ...sv, synced: true, syncedAt: new Date().toISOString() });
      synced++;

    } catch (err) {
      console.error('[sync] survey error:', err);
      errors.push(`Survey ${sv.date}: ${err.message}`);
    }
  }

  // ── Fan events ─────────────────────────────────────────────────────────────
  const events = await getUnsyncedFanEvents();
  for (const ev of events) {
    try {
      const { error } = await supabase.from('fan_events').upsert({
        local_id:       ev.id,
        event_date:     ev.date  || null,
        event_time:     ev.time  || null,
        fans_affected:  ev.fans  || [],
        cause:          ev.cause || null,
        actions_taken:  ev.actions || null,
        duration:       ev.duration || null,
        resolution:     ev.resolution || null,
      }, { onConflict: 'local_id' });
      if (error) throw error;
      await saveFanEvent({ ...ev, synced: true });
      synced++;
    } catch (err) {
      errors.push(`Fan event ${ev.date}: ${err.message}`);
    }
  }

  return { synced, errors };
};
