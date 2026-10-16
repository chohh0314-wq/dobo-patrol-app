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
  const elecCount = el("elecCount");
  const signCount = el("signCount");
  const gisCount = el("gisCount");
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
    if (num(etcCount) || etcNote.value.trim()) {
      const etcText = etcNote.value.trim();
      parts.push(etcText ? `기타 ${num(etcCount)}EA(${etcText})` : `기타 ${num(etcCount)}EA`);
    }
    return parts.join(", ");
  }

  [lmOne, lm90, lmT, lm45, lmEnd].forEach((i) => i.addEventListener("input", updateLineTotal));
  remarkAutoBtn.addEventListener("click", () => {
    remarkInput.value = buildAutoRemark();
  });

  /* ---------- GPS ---------- */
  gpsBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      gpsStatus.textContent = "이 기기에서는 위치 기능을 사용할 수 없습니다.";
      return;
    }
    gpsStatus.textContent = "위치 가져오는 중...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        locationInput.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        gpsStatus.textContent = `GPS 정확도 약 ${Math.round(pos.coords.accuracy)}m · 필요시 직접 수정하세요`;
      },
      (err) => {
        gpsStatus.textContent = `위치를 가져오지 못했습니다 (${err.message})`;
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  /* ---------- Photo ---------- */
  photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (!file) return;
    currentPhotoBlob = file;
    const url = URL.createObjectURL(file);
    photoPreview.src = url;
    photoPreview.hidden = false;
    photoClearBtn.hidden = false;
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
    valveCount.value = 0;
    elecCount.value = 0;
    signCount.value = 0;
    gisCount.value = 0;
    lmOne.value = 0;
    lm90.value = 0;
    lmT.value = 0;
    lm45.value = 0;
    lmEnd.value = 0;
    etcCount.value = 0;
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
      elec: num(elecCount),
      sign: num(signCount),
      gis: num(gisCount),
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
    aoa.push(["구간", "위치", "점검대상", "", "", "", "", "", "비고"]);
    aoa.push(["", "", "밸브", "전기방식", "라인마크", "배관표지판", "GIS", "기타", ""]);

    let lastSection = null;
    const totals = { valve: 0, elec: 0, line: 0, sign: 0, gis: 0, etc: 0 };

    entries.forEach((e) => {
      const showSection = e.section && e.section !== lastSection ? e.section : "";
      lastSection = e.section || lastSection;

      aoa.push([
        showSection,
        e.location || "",
        e.valve || "",
        e.elec || "",
        e.lineTotal || "",
        e.sign || "",
        e.gis || "",
        e.etcCount || "",
        e.remark || "",
      ]);

      totals.valve += e.valve;
      totals.elec += e.elec;
      totals.line += e.lineTotal;
      totals.sign += e.sign;
      totals.gis += e.gis;
      totals.etc += e.etcCount;
    });

    aoa.push([
      "계", "", totals.valve || "", totals.elec || "", totals.line || "",
      totals.sign || "", totals.gis || "", totals.etc || "", "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
      { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
      { s: { r: 2, c: 2 }, e: { r: 2, c: 7 } },
      { s: { r: 2, c: 8 }, e: { r: 3, c: 8 } },
    ];
    ws["!cols"] = [
      { wch: 6 }, { wch: 28 }, { wch: 7 }, { wch: 9 },
      { wch: 9 }, { wch: 10 }, { wch: 6 }, { wch: 7 }, { wch: 36 },
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
  updateLineTotal();
  refreshList();
})();
