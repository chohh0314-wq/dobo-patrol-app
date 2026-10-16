(() => {
  "use strict";

  /* ---------- IndexedDB helper ---------- */
  const DB_NAME = "dobo-patrol-db";
  const STORE = "entries";
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function dbAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.createdAt - b.createdAt));
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(entry) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbDelete(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbClear() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /* ---------- DOM refs ---------- */
  const el = (id) => document.getElementById(id);
  const sectionInput = el("sectionInput");
  const locationInput = el("locationInput");
  const gpsBtn = el("gpsBtn");
  const gpsStatus = el("gpsStatus");
  const photoInput = el("photoInput");
  const photoPreview = el("photoPreview");
  const photoClearBtn = el("photoClearBtn");
  const valveCount = el("valveCount");
  const valveNote = el("valveNote");
  const elecCount = el("elecCount");
  const elecNote = el("elecNote");
  const signCount = el("signCount");
  const signNote = el("signNote");
  const gisCount = el("gisCount");
  const gisNote = el("gisNote");
  const lmOne = el("lmOne");
  const lm90 = el("lm90");
  const lmT = el("lmT");
  const lm45 = el("lm45");
  const lmEnd = el("lmEnd");
  const lineTotal = el("lineTotal");
  const etcCount = el("etcCount");
  const etcNote = el("etcNote");
  const remarkInput = el("remarkInput");
  const remarkAutoBtn = el("remarkAutoBtn");
  const saveBtn = el("saveBtn");
  const entryList = el("entryList");
  const entryCount = el("entryCount");
  const clearAllBtn = el("clearAllBtn");
  const exportXlsxBtn = el("exportXlsxBtn");
  const exportPhotosBtn = el("exportPhotosBtn");

  let currentPhotoBlob = null;

  /* ---------- helpers ---------- */
  function num(input) {
    const v = parseInt(input.value, 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  function updateLineTotal() {
    const total = num(lmOne) + num(lm90) + num(lmT) + num(lm45) + num(lmEnd);
    lineTotal.textContent = `(합계 ${total})`;
    return total;
  }

  function buildAutoRemark() {
    const parts = [];
    const lineParts = [];
    if (num(lmOne)) lineParts.push(`일방 ${num(lmOne)}EA`);
    if (num(lm90)) lineParts.push(`90° ${num(lm90)}EA`);
    if (num(lmT)) lineParts.push(`T ${num(lmT)}EA`);
    if (num(lm45)) lineParts.push(`45° ${num(lm45)}EA`);
    if (num(lmEnd)) lineParts.push(`마감 ${num(lmEnd)}EA`);
    if (lineParts.length) parts.push(lineParts.join(", "));
    [valveNote, elecNote, signNote, gisNote, etcNote].forEach((input) => {
      const text = input.value.trim();
      if (text) parts.push(text);
    });
    return parts.join(", ");
  }

  [lmOne, lm90, lmT, lm45, lmEnd].forEach((i) => i.addEventListener("input", updateLineTotal));
  remarkAutoBtn.addEventListener("click", () => {
    remarkInput.value = buildAutoRemark();
  });

  /* ---------- GPS & reverse geocoding ---------- */
  const KAKAO_REST_KEY = "8debd5ead09208eca5cd0d6415af63c5";

  async function reverseGeocode(lat, lon) {
    const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lon}&y=${lat}`;
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const doc = data.documents && data.documents[0];
    if (!doc) return null;
    const jibun = doc.address && doc.address.address_name;
    const road = doc.road_address && doc.road_address.address_name;
    return jibun || road || null;
  }

  async function applyLocation(lat, lon, sourceLabel) {
    locationInput.value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    gpsStatus.textContent = `${sourceLabel} · 주소 변환 중...`;
    try {
      const address = await reverseGeocode(lat, lon);
      if (address) {
        locationInput.value = address;
        gpsStatus.textContent = `${sourceLabel} · 주소로 자동 입력했습니다 · 필요시 직접 수정하세요`;
      } else {
        gpsStatus.textContent = `${sourceLabel} · 주소를 찾지 못해 좌표로 표시했습니다 · 필요시 직접 수정하세요`;
      }
    } catch (err) {
      gpsStatus.textContent = `${sourceLabel} · 주소 변환 실패(인터넷 연결 확인) · 좌표로 표시했습니다`;
    }
  }

  gpsBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      gpsStatus.textContent = "이 기기에서는 위치 기능을 사용할 수 없습니다.";
      return;
    }
    gpsStatus.textContent = "위치 가져오는 중...";
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await applyLocation(latitude, longitude, `GPS 정확도 약 ${Math.round(pos.coords.accuracy)}m`);
      },
      (err) => {
        gpsStatus.textContent = `위치를 가져오지 못했습니다 (${err.message})`;
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  /* ---------- EXIF GPS extraction ---------- */
  function rationalToDeg(view, offset, littleEndian) {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const num = view.getUint32(offset + i * 8, littleEndian);
      const den = view.getUint32(offset + i * 8 + 4, littleEndian);
      parts.push(den ? num / den : 0);
    }
    return parts[0] + parts[1] / 60 + parts[2] / 3600;
  }

  async function readExifGps(file) {
    try {
      const buf = await file.slice(0, 256 * 1024).arrayBuffer();
      const view = new DataView(buf);
      if (view.getUint16(0) !== 0xffd8) return null;

      let offset = 2;
      let exifOffset = null;
      while (offset < view.byteLength - 4) {
        if (view.getUint8(offset) !== 0xff) break;
        const marker = view.getUint8(offset + 1);
        if (marker === 0xe1) {
          const segStart = offset + 4;
          if (
            view.getUint32(segStart) === 0x45786966 &&
            view.getUint16(segStart + 4) === 0x0000
          ) {
            exifOffset = segStart + 6;
          }
          break;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        const segLen = view.getUint16(offset + 2);
        offset += 2 + segLen;
      }
      if (exifOffset === null) return null;

      const tiffStart = exifOffset;
      const byteOrder = view.getUint16(tiffStart);
      const little = byteOrder === 0x4949;
      const ifd0Offset = tiffStart + view.getUint32(tiffStart + 4, little);

      let gpsIfdOffset = null;
      const numEntries0 = view.getUint16(ifd0Offset, little);
      for (let i = 0; i < numEntries0; i++) {
        const entryOffset = ifd0Offset + 2 + i * 12;
        const tag = view.getUint16(entryOffset, little);
        if (tag === 0x8825) {
          gpsIfdOffset = tiffStart + view.getUint32(entryOffset + 8, little);
          break;
        }
      }
      if (gpsIfdOffset === null) return null;

      let latRef = null, lonRef = null, lat = null, lon = null;
      const numEntriesGps = view.getUint16(gpsIfdOffset, little);
      for (let i = 0; i < numEntriesGps; i++) {
        const entryOffset = gpsIfdOffset + 2 + i * 12;
        const tag = view.getUint16(entryOffset, little);
        const valueOffset = tiffStart + view.getUint32(entryOffset + 8, little);
        if (tag === 1) latRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        else if (tag === 3) lonRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        else if (tag === 2) lat = rationalToDeg(view, valueOffset, little);
        else if (tag === 4) lon = rationalToDeg(view, valueOffset, little);
      }
      if (lat === null || lon === null) return null;
      if (latRef === "S") lat = -lat;
      if (lonRef === "W") lon = -lon;
      return { lat, lon };
    } catch (err) {
      return null;
    }
  }

  /* ---------- Photo ---------- */
  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    if (!file) return;
    currentPhotoBlob = file;
    const url = URL.createObjectURL(file);
    photoPreview.src = url;
    photoPreview.hidden = false;
    photoClearBtn.hidden = false;

    gpsStatus.textContent = "사진에서 위치 정보 확인 중...";
    const gps = await readExifGps(file);
    if (gps) {
      await applyLocation(gps.lat, gps.lon, "사진의 위치 정보");
    } else {
      gpsStatus.textContent = "사진에 위치 정보가 없습니다 · '위치 가져오기'를 누르거나 직접 입력하세요";
    }
  });

  photoClearBtn.addEventListener("click", () => {
    currentPhotoBlob = null;
    photoInput.value = "";
    photoPreview.hidden = true;
    photoClearBtn.hidden = true;
  });

  /* ---------- Save / reset ---------- */
  function resetFormForNextPoint() {
    locationInput.value = "";
    gpsStatus.textContent = "";
    currentPhotoBlob = null;
    photoInput.value = "";
    photoPreview.hidden = true;
    photoClearBtn.hidden = true;
    valveCount.value = "";
    valveNote.value = "";
    elecCount.value = "";
    elecNote.value = "";
    signCount.value = "";
    signNote.value = "";
    gisCount.value = "";
    gisNote.value = "";
    lmOne.value = "";
    lm90.value = "";
    lmT.value = "";
    lm45.value = "";
    lmEnd.value = "";
    etcCount.value = "";
    etcNote.value = "";
    remarkInput.value = "";
    updateLineTotal();
  }

  saveBtn.addEventListener("click", async () => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      section: sectionInput.value.trim(),
      location: locationInput.value.trim(),
      valve: num(valveCount),
      valveNote: valveNote.value.trim(),
      elec: num(elecCount),
      elecNote: elecNote.value.trim(),
      sign: num(signCount),
      signNote: signNote.value.trim(),
      gis: num(gisCount),
      gisNote: gisNote.value.trim(),
      lineBreakdown: {
        one: num(lmOne),
        d90: num(lm90),
        t: num(lmT),
        d45: num(lm45),
        end: num(lmEnd),
      },
      lineTotal: updateLineTotal(),
      etcCount: num(etcCount),
      etcNote: etcNote.value.trim(),
      remark: remarkInput.value.trim() || buildAutoRemark(),
      photoBlob: currentPhotoBlob,
    };

    if (!entry.location && !entry.photoBlob && entry.valve + entry.elec + entry.sign + entry.gis + entry.lineTotal + entry.etcCount === 0) {
      alert("위치, 사진, 점검 수량 중 최소 하나는 입력해주세요.");
      return;
    }

    await dbPut(entry);
    if (entry.section) localStorage.setItem("dobo-last-section", entry.section);
    resetFormForNextPoint();
    await refreshList();
  });

  /* ---------- List rendering ---------- */
  function entrySummary(e) {
    const bits = [];
    if (e.valve) bits.push(`밸브${e.valve}`);
    if (e.elec) bits.push(`전기방식${e.elec}`);
    if (e.lineTotal) bits.push(`라인마크${e.lineTotal}`);
    if (e.sign) bits.push(`표지판${e.sign}`);
    if (e.gis) bits.push(`GIS${e.gis}`);
    if (e.etcCount) bits.push(`기타${e.etcCount}`);
    return bits.join(" · ") || "점검 항목 없음";
  }

  async function refreshList() {
    const entries = await dbAll();
    entryCount.textContent = `${entries.length}건`;
    entryList.innerHTML = "";

    if (!entries.length) {
      const empty = document.createElement("li");
      empty.className = "empty-msg";
      empty.textContent = "저장된 지점이 없습니다.";
      entryList.appendChild(empty);
      return;
    }

    entries.forEach((e) => {
      const li = document.createElement("li");
      li.className = "entry-item";

      const thumb = document.createElement("img");
      thumb.className = "entry-thumb";
      if (e.photoBlob) {
        thumb.src = URL.createObjectURL(e.photoBlob);
      } else {
        thumb.style.display = "none";
      }

      const main = document.createElement("div");
      main.className = "entry-main";
      const title = document.createElement("div");
      title.className = "entry-title";
      title.textContent = `${e.section ? `[${e.section}] ` : ""}${e.location || "위치 미입력"}`;
      const sub = document.createElement("div");
      sub.className = "entry-sub";
      sub.textContent = entrySummary(e) + (e.remark ? ` · ${e.remark}` : "");
      main.appendChild(title);
      main.appendChild(sub);

      const delBtn = document.createElement("button");
      delBtn.className = "entry-del";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", async () => {
        if (confirm("이 지점을 삭제할까요?")) {
          await dbDelete(e.id);
          await refreshList();
        }
      });

      li.appendChild(thumb);
      li.appendChild(main);
      li.appendChild(delBtn);
      entryList.appendChild(li);
    });
  }

  clearAllBtn.addEventListener("click", async () => {
    if (confirm("저장된 모든 지점을 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) {
      await dbClear();
      await refreshList();
    }
  });

  /* ---------- Excel export ---------- */
  function lineBreakdownText(lb) {
    const parts = [];
    if (lb.one) parts.push(`일방 ${lb.one}EA`);
    if (lb.d90) parts.push(`90° ${lb.d90}EA`);
    if (lb.t) parts.push(`T ${lb.t}EA`);
    if (lb.d45) parts.push(`45° ${lb.d45}EA`);
    if (lb.end) parts.push(`마감 ${lb.end}EA`);
    return parts.join(", ");
  }

  async function exportXlsx() {
    const entries = await dbAll();
    if (!entries.length) {
      alert("내보낼 데이터가 없습니다.");
      return;
    }

    const aoa = [];
    const today = new Date();
    aoa.push([`${today.getFullYear()}년 도보순찰 점검표`]);
    aoa.push([]);
    aoa.push(["구간", "위치", "점검대상", "", "", "", "", "", "", "", "", "", "", ""]);
    aoa.push([
      "", "",
      "밸브", "메모",
      "전기방식", "메모",
      "라인마크", "메모",
      "배관표지판", "메모",
      "GIS", "메모",
      "기타", "메모",
    ]);

    let lastSection = null;
    const totals = { valve: 0, elec: 0, line: 0, sign: 0, gis: 0, etc: 0 };

    entries.forEach((e) => {
      const showSection = e.section && e.section !== lastSection ? e.section : "";
      lastSection = e.section || lastSection;

      aoa.push([
        showSection,
        e.location || "",
        e.valve || "",
        e.valveNote || "",
        e.elec || "",
        e.elecNote || "",
        e.lineTotal || "",
        lineBreakdownText(e.lineBreakdown) || "",
        e.sign || "",
        e.signNote || "",
        e.gis || "",
        e.gisNote || "",
        e.etcCount || "",
        e.etcNote || "",
      ]);

      totals.valve += e.valve;
      totals.elec += e.elec;
      totals.line += e.lineTotal;
      totals.sign += e.sign;
      totals.gis += e.gis;
      totals.etc += e.etcCount;
    });

    aoa.push([
      "계", "",
      totals.valve || "", "",
      totals.elec || "", "",
      totals.line || "", "",
      totals.sign || "", "",
      totals.gis || "", "",
      totals.etc || "", "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
      { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
      { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
      { s: { r: 2, c: 2 }, e: { r: 2, c: 13 } },
    ];
    ws["!cols"] = [
      { wch: 6 }, { wch: 26 },
      { wch: 6 }, { wch: 16 },
      { wch: 8 }, { wch: 16 },
      { wch: 8 }, { wch: 22 },
      { wch: 9 }, { wch: 16 },
      { wch: 6 }, { wch: 16 },
      { wch: 6 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "점검표");

    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `도보순찰_점검표_${stamp}.xlsx`);
  }

  exportXlsxBtn.addEventListener("click", () => {
    exportXlsx().catch((err) => alert(`내보내기 실패: ${err.message}`));
  });

  /* ---------- Photo zip export ---------- */
  async function exportPhotos() {
    const entries = (await dbAll()).filter((e) => e.photoBlob);
    if (!entries.length) {
      alert("저장된 사진이 없습니다.");
      return;
    }
    const zip = new JSZip();
    entries.forEach((e, idx) => {
      const safeLoc = (e.location || "위치미입력").replace(/[\\/:*?"<>|]/g, "_").slice(0, 30);
      const num = String(idx + 1).padStart(3, "0");
      const sectionTag = e.section ? `구간${e.section}_` : "";
      zip.file(`${num}_${sectionTag}${safeLoc}.jpg`, e.photoBlob);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const today = new Date();
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `도보순찰_사진_${stamp}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  exportPhotosBtn.addEventListener("click", () => {
    exportPhotos().catch((err) => alert(`사진 저장 실패: ${err.message}`));
  });

  /* ---------- Service worker ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* ---------- init ---------- */
  const lastSection = localStorage.getItem("dobo-last-section");
  if (lastSection) sectionInput.value = lastSection;
  updateLineTotal();
  refreshList();
})();
