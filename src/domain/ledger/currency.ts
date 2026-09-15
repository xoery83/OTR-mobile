export const ISO_4217_METADATA_VERSION = "CLDR-48.0";

const zeroScaleCodes =
  "AFN ALL BIF CLP COP DJF GNF HUF IDR IQD IRR ISK JPY KMF KPW KRW LAK LBP MGA MMK PKR PYG RWF SLL SOS SYP UGX VND VUV XAF XOF XPF YER".split(
    " ",
  );
const threeScaleCodes = "BHD JOD KWD LYD OMR TND".split(" ");
const twoScaleCodes =
  "AED AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CNY CRC CUC CUP CVE CZK DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GTQ GYD HKD HNL HRK HTG ILS INR JMD KES KGS KHR KYD KZT LKR LRD LSL MAD MDL MKD MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PLN QAR RON RSD RUB SAR SBD SCR SDG SEK SGD SHP SLE SRD SSP STN SVC SZL THB TJS TMT TOP TRY TTD TWD TZS UAH USD UYU UZS VES WST XCD XCG XDR XSU ZAR ZMW ZWG ZWL".split(
    " ",
  );
const ZERO_SCALE = new Set(zeroScaleCodes);
const THREE_SCALE = new Set(threeScaleCodes);
const TWO_SCALE = new Set(twoScaleCodes);

export const SUPPORTED_CURRENCY_CODES = [
  ...zeroScaleCodes,
  ...twoScaleCodes,
  ...threeScaleCodes,
].sort();

export function currencyScale(currency: string): number | null {
  if (ZERO_SCALE.has(currency)) return 0;
  if (THREE_SCALE.has(currency)) return 3;
  return TWO_SCALE.has(currency) ? 2 : null;
}

export function isIso4217Money(currency: string, scale: number): boolean {
  return currencyScale(currency) === scale;
}
