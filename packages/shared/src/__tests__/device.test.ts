import { describe, it, expect } from 'vitest';
import { parseDeviceType } from '../device';

describe('parseDeviceType', () => {
  it('iPhone → MOBILE', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    )).toBe('MOBILE');
  });

  it('Android-телефон (содержит Mobile) → MOBILE', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
    )).toBe('MOBILE');
  });

  it('iPad → TABLET', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    )).toBe('TABLET');
  });

  it('Android-планшет (без Mobile) → TABLET', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    )).toBe('TABLET');
  });

  it('Windows-десктоп → DESKTOP', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    )).toBe('DESKTOP');
  });

  it('macOS-десктоп → DESKTOP', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    )).toBe('DESKTOP');
  });

  it('null → UNKNOWN', () => {
    expect(parseDeviceType(null)).toBe('UNKNOWN');
  });

  it('undefined → UNKNOWN', () => {
    expect(parseDeviceType(undefined)).toBe('UNKNOWN');
  });

  it('пустая строка и пробелы → UNKNOWN', () => {
    expect(parseDeviceType('')).toBe('UNKNOWN');
    expect(parseDeviceType('   ')).toBe('UNKNOWN');
  });
});
