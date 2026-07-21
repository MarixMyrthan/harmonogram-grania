export type ClientDeviceType = 'computer' | 'phone' | 'tablet' | 'unknown'
export type ClientOperatingSystem = 'windows' | 'android' | 'apple' | 'linux' | 'unknown'
export type ClientBrowser = 'firefox' | 'chrome' | 'edge' | 'safari' | 'opera' | 'brave' | 'unknown'

export interface ClientInfo {
  deviceType: ClientDeviceType
  operatingSystem: ClientOperatingSystem
  browser: ClientBrowser
}

type NavigatorWithBrave = Navigator & {
  brave?: {
    isBrave?: () => Promise<boolean>
  }
}

function detectDevice(userAgent: string): ClientDeviceType {
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return 'tablet'
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return 'tablet'
  if (/Mobi|iPhone|iPod|Android/i.test(userAgent)) return 'phone'
  if (userAgent) return 'computer'
  return 'unknown'
}

function detectOperatingSystem(userAgent: string): ClientOperatingSystem {
  const iPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1

  if (/iPad|iPhone|iPod/i.test(userAgent) || iPadDesktopMode || /Macintosh|Mac OS X/i.test(userAgent)) {
    return 'apple'
  }
  if (/Android/i.test(userAgent)) return 'android'
  if (/Windows/i.test(userAgent)) return 'windows'
  if (/Linux|X11|CrOS/i.test(userAgent)) return 'linux'
  return 'unknown'
}

async function detectBrowser(userAgent: string): Promise<ClientBrowser> {
  const brave = (navigator as NavigatorWithBrave).brave
  if (brave?.isBrave) {
    try {
      if (await brave.isBrave()) return 'brave'
    } catch {
      // Przeglądarka nie udostępniła informacji o Brave.
    }
  }

  if (/EdgA?|EdgiOS/i.test(userAgent)) return 'edge'
  if (/OPR|Opera|OPiOS/i.test(userAgent)) return 'opera'
  if (/Firefox|FxiOS/i.test(userAgent)) return 'firefox'
  if (/Chrome|CriOS/i.test(userAgent)) return 'chrome'
  if (/Safari/i.test(userAgent)) return 'safari'
  return 'unknown'
}

export async function detectClientInfo(): Promise<ClientInfo> {
  const userAgent = navigator.userAgent || ''

  return {
    deviceType: detectDevice(userAgent),
    operatingSystem: detectOperatingSystem(userAgent),
    browser: await detectBrowser(userAgent),
  }
}
