import { useBrandingStore } from './brandingStore'

export function useBranding() {
  const { primaryColor, secondaryColor, logoUrl, schoolName, setBranding, applyToDOM } = useBrandingStore()

  const applyBranding = (branding) => {
    setBranding(branding)
    applyToDOM(branding.primaryColor, branding.secondaryColor)
  }

  return { primaryColor, secondaryColor, logoUrl, schoolName, applyBranding }
}