/**
 * ZeptAI — Web Crypto Utilities
 * ──────────────────────────────────────────────────────────────
 * Browser-side AES-GCM encryption for medical report files.
 *
 * SECURITY NOTICE:
 * ─────────────────────────────────────────────────────────────
 * This module provides a working encryption layer for demo/dev
 * purposes. Production healthcare deployment MUST use:
 *   - Managed key service (AWS KMS, Google Cloud KMS, etc.)
 *   - Server-side policy enforcement
 *   - Audit logging for all key operations
 *   - Full HIPAA / local healthcare compliance review
 *   - Never store raw encryption keys in Firestore or localStorage
 * ─────────────────────────────────────────────────────────────
 *
 * Config flag: set window.ENCRYPTION_ENABLED = true to enable.
 * Default is false so demo works without key setup.
 */

/* eslint-disable no-undef */
(function () {
  'use strict';

  const ENCRYPTION_ENABLED = window.ENCRYPTION_ENABLED === true;
  const ALGO = { name: 'AES-GCM', length: 256 };

  /* ── Key Generation ─────────────────────────────────────────────────────── */

  /**
   * Generate a fresh AES-GCM 256-bit key.
   * In production, derive this from a server-managed secret per user.
   * @returns {Promise<CryptoKey>}
   */
  async function generateKey() {
    return crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
  }

  /**
   * Export a CryptoKey to a base64 string for storage.
   * TODO (production): Replace with server-side key management.
   *   Do NOT store exported raw keys in Firestore.
   */
  async function exportKey(cryptoKey) {
    const raw = await crypto.subtle.exportKey('raw', cryptoKey);
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  }

  /**
   * Import a previously exported base64 key.
   */
  async function importKey(b64) {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, ALGO, false, ['encrypt', 'decrypt']);
  }

  /* ── Encrypt / Decrypt ──────────────────────────────────────────────────── */

  /**
   * Encrypt a File object.
   * @param {File} file
   * @param {CryptoKey} key
   * @returns {Promise<{blob: Blob, iv: string}>}
   */
  async function encryptFile(file, key) {
    if (!ENCRYPTION_ENABLED) {
      return { blob: file, iv: null, encrypted: false };
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await file.arrayBuffer();
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
    const blob = new Blob([cipherBuf], { type: 'application/octet-stream' });
    const ivB64 = btoa(String.fromCharCode(...iv));
    return { blob, iv: ivB64, encrypted: true };
  }

  /**
   * Decrypt an encrypted blob.
   * @param {Blob} encBlob
   * @param {CryptoKey} key
   * @param {string} ivB64
   * @returns {Promise<ArrayBuffer>}
   */
  async function decryptFile(encBlob, key, ivB64) {
    if (!ENCRYPTION_ENABLED) return encBlob.arrayBuffer();
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const buf = await encBlob.arrayBuffer();
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, buf);
  }

  /* ── Demo key stored in sessionStorage ──────────────────────────────────── */
  /*
   * TODO (production): Replace this with a proper key derivation / exchange
   * flow tied to server-side identity. sessionStorage is cleared on tab close
   * which is appropriate for ephemeral demo use only.
   */
  async function getSessionKey(uid) {
    const storageKey = `zpt_enc_key_${uid}`;
    const stored = sessionStorage.getItem(storageKey);
    if (stored) return importKey(stored);
    const key = await generateKey();
    const exported = await exportKey(key);
    sessionStorage.setItem(storageKey, exported);
    return key;
  }

  /* ── Expose globally ────────────────────────────────────────────────────── */
  window.ZeptCrypto = {
    ENCRYPTION_ENABLED,
    generateKey,
    exportKey,
    importKey,
    encryptFile,
    decryptFile,
    getSessionKey,
  };
})();
