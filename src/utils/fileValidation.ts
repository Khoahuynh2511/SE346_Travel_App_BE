/**
 * Magic byte signatures for image files
 * Each signature is an array of byte values to check at the beginning of the file
 */
interface FileSignature {
  magicBytes: number[];
  offset: number;
  mime: string;
  check?: (buffer: Buffer) => boolean;
}

const signatures: FileSignature[] = [
  // JPEG: FF D8 FF (first 3 bytes)
  {
    magicBytes: [0xff, 0xd8, 0xff],
    offset: 0,
    mime: "image/jpeg",
  },
  // PNG: 89 50 4E 47 0D 0A 1A 0A (first 8 bytes)
  {
    magicBytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    offset: 0,
    mime: "image/png",
  },
  // GIF: "GIF87a" or "GIF89a" (first 6 bytes)
  {
    magicBytes: [0x47, 0x49, 0x46], // "GIF"
    offset: 0,
    mime: "image/gif",
    check: (buffer) => {
      // Check for "GIF87a" or "GIF89a"
      const version = buffer.subarray(3, 6);
      return version[0] === 0x38 && (version[1] === 0x37 || version[1] === 0x39) && version[2] === 0x61;
    },
  },
  // WebP: RIFF....WEBP (bytes 0-3 and 8-11)
  {
    magicBytes: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    offset: 0,
    mime: "image/webp",
    check: (buffer) => {
      // Check for "WEBP" at bytes 8-11
      if (buffer.length < 12) return false;
      return (
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50 // "WEBP"
      );
    },
  },
];

/**
 * Validates an image file by checking its magic bytes (file signature)
 * @param buffer - The file buffer to validate
 * @returns Object containing validity status and detected MIME type
 */
export function validateImageFile(buffer: Buffer): { valid: boolean; mime: string | null } {
  // Need at least 12 bytes for the largest signature check (WebP)
  if (buffer.length < 12) {
    return { valid: false, mime: null };
  }

  // Check each signature
  for (const signature of signatures) {
    const signatureLength = signature.magicBytes.length;

    // Ensure buffer is large enough for this signature
    if (buffer.length < signature.offset + signatureLength) {
      continue;
    }

    // Check magic bytes match
    let matches = true;
    for (let i = 0; i < signatureLength; i++) {
      if (buffer[signature.offset + i] !== signature.magicBytes[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      // If there's an additional check function, run it
      if (signature.check && !signature.check(buffer)) {
        continue;
      }

      return { valid: true, mime: signature.mime };
    }
  }

  // No matching signature found
  return { valid: false, mime: null };
}
