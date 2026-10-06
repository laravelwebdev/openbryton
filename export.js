
/* --- EXPORT LOGIC --- */
async function generateBrytonZip() {
  if (state.points.length === 0 || state.combinedInstructions.length === 0) {
    showToast(t('toastAnalyzeFirst'), 'error');
    return;
  }

  try {
    const zip = new JSZip();
    let prefix = elements.brytonRouteName.value.trim();

    // Fallback to original base name if input is empty
    if (!prefix) {
      prefix = state.baseName || 'bryton-route';
    }

    // Sanitize prefix to be safe for filenames
    prefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');

    const smyBuffer = createSmyBuffer(state.points.length, state.boundingBox, state.totalDistance);
    zip.file(`${prefix}.smy`, smyBuffer);

    const trackBuffer = createTrackBuffer(state.points);
    zip.file(`${prefix}.track`, trackBuffer);

    const tinfoBuffer = createTinfoBuffer(state.combinedInstructions);
    zip.file(`${prefix}.tinfo`, tinfoBuffer);

    const folder = zip.folder(prefix);

    const zinfoBuffer = new ArrayBuffer(16);
    const zview = new DataView(zinfoBuffer);
    zview.setUint32(0, 2, true);
    zview.setUint32(4, 12, true);
    folder.file(`${prefix}.zinfo`, zinfoBuffer);

    folder.file(`dupli.track`, trackBuffer);
    folder.file(`dupli2.track`, trackBuffer);

    const sortBuffer = new ArrayBuffer(16);
    const sview = new DataView(sortBuffer);
    sview.setUint32(0, 0, true);
    sview.setUint32(4, state.points.length > 0 ? state.points.length - 1 : 0, true);
    sview.setUint32(8, 0x103a1a41, true);
    sview.setUint32(12, 0, true);
    folder.file(`sort1.path`, sortBuffer);

    showToast(t('toastCreatingZip'), 'info', false);
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${prefix}-bryton.zip`);

    showToast(t('toastZipSuccess'), 'success');
  } catch (error) {
    console.error('Failed to generate ZIP:', error);
    showToast(t('toastZipError') + error.message, 'error');
  }
}

function generateKmlFile() {
  if (state.points.length === 0) return;
  let prefix = elements.brytonRouteName.value.trim() || state.baseName || 'bryton-route';
  prefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');

  const kmlString = createKmlString(state.points, prefix);
  const blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' });
  saveAs(blob, `${prefix}.kml`);
  showToast('KML file downloaded successfully!', 'success');
}

function generateGpxFile() {
  if (state.points.length === 0) return;
  let prefix = elements.brytonRouteName.value.trim() || state.baseName || 'bryton-route';
  prefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');

  const gpxString = createGpxString(state.points, prefix);
  const blob = new Blob([gpxString], { type: 'application/gpx+xml' });
  saveAs(blob, `${prefix}.gpx`);
  showToast('GPX file downloaded successfully!', 'success');
}

async

function generateFitFile() {
  if (state.points.length === 0) return;
  
  const origBtnText = elements.btnDownloadFit.innerHTML;
  elements.btnDownloadFit.innerHTML = '<i class="lucide lucide-loader spinner"></i>';
  elements.btnDownloadFit.disabled = true;
  
  try {
    const fitSdk = await import('https://esm.sh/@garmin/fitsdk@21.217.0');
    const Encoder = fitSdk.Encoder;
    const Profile = fitSdk.Profile;
    
    const encoder = new Encoder();

    encoder.onMesg(Profile.MesgNum.FILE_ID, {
      type: Profile.types.file.course,
      manufacturer: Profile.types.manufacturer.development,
      product: 0,
      timeCreated: new Date(),
      serialNumber: Math.floor(Math.random() * 0xFFFFFFFF)
    });

    let routeName = elements.brytonRouteName.value.trim() || state.baseName || 'BrytonRoute';
    encoder.onMesg(Profile.MesgNum.COURSE, {
      name: routeName.substring(0, 15),
      sport: Profile.types.sport.cycling
    });

    const baseTime = Date.now();
    
    state.points.forEach((pt, i) => {
      pt._fitDate = new Date(baseTime + i * 1000);
      encoder.onMesg(Profile.MesgNum.RECORD, {
        timestamp: pt._fitDate,
        positionLat: Math.round(pt.lat * (0x7FFFFFFF / 180)),
        positionLong: Math.round(pt.lon * (0x7FFFFFFF / 180)),
        altitude: pt.ele,
        distance: pt.distFromStart
      });
    });

    function mapToFitCp(code) {
      switch(code) {
        case 7: return Profile.types.coursePoint.sharpLeft;
        case 3: return Profile.types.coursePoint.left;
        case 5: return Profile.types.coursePoint.slightLeft;
        case 10: return Profile.types.coursePoint.straight;
        case 1: return Profile.types.coursePoint.straight;
        case 4: return Profile.types.coursePoint.slightRight;
        case 2: return Profile.types.coursePoint.right;
        case 6: return Profile.types.coursePoint.sharpRight;
        case 8: return Profile.types.coursePoint.slightRight; // Exit Right -> mapped to slight right
        case 9: return Profile.types.coursePoint.slightLeft; // Exit Left -> mapped to slight left
        case 11: return Profile.types.coursePoint.uTurn; // uturn right
        case 12: return Profile.types.coursePoint.uTurn; // uturn left
        case 100: return Profile.types.coursePoint.generic; // Target -> generic
        case 101: return Profile.types.coursePoint.food;
        case 102: return Profile.types.coursePoint.water;
        case 103: return Profile.types.coursePoint.summit;
        case 104: return Profile.types.coursePoint.danger;
        case 105: return Profile.types.coursePoint.sprint;
        case 106: return Profile.types.coursePoint.firstAid;
        case 107: return Profile.types.coursePoint.valley;
        case 108: return Profile.types.coursePoint.generic;
        case 190: return Profile.types.coursePoint.segmentStart;
        case 191: return Profile.types.coursePoint.segmentEnd;
        default: return Profile.types.coursePoint.generic;
      }
    }

    state.combinedInstructions.forEach((inst) => {
      const pt = state.points[inst.index];
      if (!pt || !pt._fitDate) return;
      encoder.onMesg(Profile.MesgNum.COURSE_POINT, {
        timestamp: pt._fitDate,
        positionLat: Math.round(pt.lat * (0x7FFFFFFF / 180)),
        positionLong: Math.round(pt.lon * (0x7FFFFFFF / 180)),
        distance: pt.distFromStart,
        type: mapToFitCp(inst.directionCode),
        name: (inst.instruction || '').substring(0, 15)
      });
    });

    const uint8Array = encoder.close();
    const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
    let prefix = routeName.replace(/[^a-zA-Z0-9_-]/g, '_');
    saveAs(blob, `${prefix}.fit`);
    
    showToast('Download file FIT berhasil!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Gagal memproses file FIT: ' + err.message, 'error');
  } finally {
    elements.btnDownloadFit.innerHTML = origBtnText;
    elements.btnDownloadFit.disabled = false;
  }
}

