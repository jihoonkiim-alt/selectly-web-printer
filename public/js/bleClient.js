// Web Bluetooth client for the XP-P326B label printer, replacing the
// print_bluetooth_thermal Flutter plugin (Android/iOS/macOS only, no web
// support). Mirrors the plugin's macOS CoreBluetooth implementation:
// 150-byte write chunks, write-with-response if supported else
// write-without-response, no OS-level pairing required.
//
// The plugin tries 3 candidate GATT service/characteristic UUID pairs.
// Which one the real printer exposes was not confirmed by static analysis
// (see webapp/probe/ble-probe.html) — rather than hardcoding one, this
// client auto-detects by trying each candidate after connecting, since the
// printer may not advertise its service UUID in the BLE advertisement
// packet (requestDevice uses acceptAllDevices for that reason).

const CANDIDATE_SERVICES = [
  '00001101-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'a76eb9e0-f3ac-4990-84cf-3a94d2426b2b',
];

const CHUNK_SIZE = 150;

let device = null;
let characteristic = null;

function reset() {
  device = null;
  characteristic = null;
}

function onDisconnected() {
  reset();
}

export function isConnected() {
  return characteristic !== null && device !== null && device.gatt.connected;
}

// Must be called from inside a user-gesture handler (e.g. a button's click
// listener) — Chrome rejects requestDevice() otherwise.
export async function connect() {
  if (!navigator.bluetooth) {
    throw new Error('이 브라우저는 Web Bluetooth를 지원하지 않습니다. 데스크톱 크롬에서 열어주세요.');
  }

  device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: CANDIDATE_SERVICES,
  });
  device.addEventListener('gattserverdisconnected', onDisconnected);

  const server = await device.gatt.connect();

  for (const serviceUuid of CANDIDATE_SERVICES) {
    try {
      const service = await server.getPrimaryService(serviceUuid);
      const chars = await service.getCharacteristics();
      const writable = chars.find(
        (c) => c.properties.write || c.properties.writeWithoutResponse
      );
      if (writable) {
        characteristic = writable;
        return { deviceName: device.name || '(이름 없음)', serviceUuid };
      }
    } catch {
      // This candidate service isn't present on this device — try the next.
    }
  }

  reset();
  throw new Error(
    '프린터에 연결은 됐지만 쓰기 가능한 서비스를 찾지 못했습니다. probe/ble-probe.html로 실제 서비스 UUID를 확인해주세요.'
  );
}

export function disconnect() {
  if (device && device.gatt.connected) {
    device.gatt.disconnect();
  }
  reset();
}

async function writeChunk(bytes) {
  if (characteristic.properties.writeWithoutResponse) {
    await characteristic.writeValueWithoutResponse(bytes);
  } else {
    await characteristic.writeValue(bytes);
  }
}

// tsplString must be UTF-8 encoded (not naive charCodeAt) so Korean names
// print correctly — this was an explicit known risk in the Dart port.
export async function writeTspl(tsplString) {
  if (!isConnected()) {
    throw new Error('프린터가 연결되어 있지 않습니다.');
  }
  const bytes = new TextEncoder().encode(tsplString);
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + CHUNK_SIZE);
    await writeChunk(chunk);
  }
}
