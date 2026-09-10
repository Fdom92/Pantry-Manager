import { classifyNativeDismissal } from './native-dismissal.domain';

describe('classifyNativeDismissal', () => {
  describe('cancellations', () => {
    it('recognises the message Capacitor throws when the picker is dismissed', () => {
      expect(classifyNativeDismissal(new Error('User cancelled photos app'))).toBe('cancelled');
    });

    it('matches regardless of casing', () => {
      expect(classifyNativeDismissal(new Error('USER CANCELLED PHOTOS APP'))).toBe('cancelled');
    });

    it('recognises an empty pick', () => {
      expect(classifyNativeDismissal(new Error('No image picked'))).toBe('cancelled');
    });

    it('accepts a plain string, not only an Error', () => {
      expect(classifyNativeDismissal('user cancelled photos app')).toBe('cancelled');
    });

    it('accepts a plain object carrying a message, as Capacitor sometimes rejects', () => {
      expect(classifyNativeDismissal({ message: 'User cancelled photos app' })).toBe('cancelled');
    });
  });

  describe('failures — anything not positively recognised', () => {
    it('treats a permission error as a failure', () => {
      expect(classifyNativeDismissal(new Error('User denied access to camera'))).toBe('failed');
    });

    it('treats a missing-plugin error as a failure', () => {
      expect(classifyNativeDismissal(new Error('Camera plugin is not implemented on android'))).toBe('failed');
    });

    it('treats an unrecognised message as a failure rather than assuming cancellation', () => {
      expect(classifyNativeDismissal(new Error('something went sideways'))).toBe('failed');
    });

    it('treats an error with no message as a failure', () => {
      expect(classifyNativeDismissal(new Error(''))).toBe('failed');
    });

    it('treats undefined as a failure', () => {
      expect(classifyNativeDismissal(undefined)).toBe('failed');
    });

    it('treats null as a failure', () => {
      expect(classifyNativeDismissal(null)).toBe('failed');
    });

    it('treats an object with a non-string message as a failure', () => {
      expect(classifyNativeDismissal({ message: 42 })).toBe('failed');
    });
  });

  it('never throws, whatever it is handed', () => {
    const oddities: unknown[] = [0, false, [], {}, Symbol('x'), () => undefined];
    for (const value of oddities) {
      expect(() => classifyNativeDismissal(value)).not.toThrow();
    }
  });
});
