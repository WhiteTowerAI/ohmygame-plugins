const API = "https://openspeech.bytedance.com/api/v3/tts";
// Preset constraints from OhMyGame shared/doubao-voices.ts; custom/cloned IDs stay allowed.
const PRESETS = {
  zh_female_vv_uranus_bigtts: { language: "zh-cn", dialects: true },
  zh_female_xiaohe_uranus_bigtts: { language: "zh-cn", dialects: true },
  zh_male_m191_uranus_bigtts: { language: "zh-cn", dialects: true },
  zh_male_taocheng_uranus_bigtts: { language: "zh-cn", dialects: true },
  zh_male_liufei_uranus_bigtts: { language: "zh-cn" },
  zh_female_sophie_uranus_bigtts: { language: "zh-cn" },
  zh_female_qingxinnvsheng_uranus_bigtts: { language: "zh-cn" },
  zh_female_cancan_uranus_bigtts: { language: "zh-cn" },
  zh_female_sajiaoxuemei_uranus_bigtts: { language: "zh-cn" },
  zh_female_tianmeixiaoyuan_uranus_bigtts: { language: "zh-cn" },
  zh_female_tianmeitaozi_uranus_bigtts: { language: "zh-cn" },
  zh_female_shuangkuaisisi_uranus_bigtts: { language: "zh-cn" },
  zh_female_peiqi_uranus_bigtts: { language: "zh-cn" },
  zh_female_linjianvhai_uranus_bigtts: { language: "zh-cn" },
  zh_male_shaonianzixin_uranus_bigtts: { language: "zh-cn" },
  zh_male_sunwukong_uranus_bigtts: { language: "zh-cn" },
  zh_female_yingyujiaoxue_uranus_bigtts: { language: "zh-cn" },
  zh_female_kefunvsheng_uranus_bigtts: { language: "zh-cn" },
  zh_female_xiaoxue_uranus_bigtts: { language: "zh-cn" },
  zh_male_dayi_uranus_bigtts: { language: "zh-cn" },
  zh_female_mizai_uranus_bigtts: { language: "zh-cn" },
  zh_female_jitangnv_uranus_bigtts: { language: "zh-cn" },
  zh_female_meilinvyou_uranus_bigtts: { language: "zh-cn" },
  zh_female_liuchangnv_uranus_bigtts: { language: "zh-cn" },
  zh_male_ruyayichen_uranus_bigtts: { language: "zh-cn" },
  en_male_tim_uranus_bigtts: { language: "en" },
  en_female_dacey_uranus_bigtts: { language: "en" },
  en_female_stokie_uranus_bigtts: { language: "en" },
  zh_female_wenroumama_uranus_bigtts: { language: "zh-cn" },
  zh_male_jieshuoxiaoming_uranus_bigtts: { language: "zh-cn" },
  zh_female_tvbnv_uranus_bigtts: { language: "zh-cn" },
  zh_male_yizhipiannan_uranus_bigtts: { language: "zh-cn" },
  zh_female_qiaopinv_uranus_bigtts: { language: "zh-cn" },
  zh_female_zhishuaiyingzi_uranus_bigtts: { language: "zh-cn" },
  zh_male_linjiananhai_uranus_bigtts: { language: "zh-cn" },
  zh_male_silang_uranus_bigtts: { language: "zh-cn" },
  zh_male_ruyaqingnian_uranus_bigtts: { language: "zh-cn" },
  zh_male_qingcang_uranus_bigtts: { language: "zh-cn" },
  zh_male_xionger_uranus_bigtts: { language: "zh-cn" },
  zh_female_yingtaowanzi_uranus_bigtts: { language: "zh-cn" },
  zh_male_wennuanahu_uranus_bigtts: { language: "zh-cn" },
  zh_male_naiqimengwa_uranus_bigtts: { language: "zh-cn" },
  zh_female_popo_uranus_bigtts: { language: "zh-cn" },
  zh_female_gaolengyujie_uranus_bigtts: { language: "zh-cn" },
  zh_male_aojiaobazong_uranus_bigtts: { language: "zh-cn" },
  zh_male_lanyinmianbao_uranus_bigtts: { language: "zh-cn" },
  zh_male_fanjuanqingnian_uranus_bigtts: { language: "zh-cn" },
  zh_female_wenroushunv_uranus_bigtts: { language: "zh-cn" },
  zh_female_gufengshaoyu_uranus_bigtts: { language: "zh-cn" },
  zh_male_huolixiaoge_uranus_bigtts: { language: "zh-cn" },
  zh_male_baqiqingshu_uranus_bigtts: { language: "zh-cn" },
  zh_male_xuanyijieshuo_uranus_bigtts: { language: "zh-cn" },
  zh_female_mengyatou_uranus_bigtts: { language: "zh-cn" },
  zh_female_tiexinnvsheng_uranus_bigtts: { language: "zh-cn" },
  zh_female_jitangmei_uranus_bigtts: { language: "zh-cn" },
  zh_male_cixingjieshuonan_uranus_bigtts: { language: "zh-cn" },
  zh_male_liangsangmengzai_uranus_bigtts: { language: "zh-cn" },
  zh_female_kailangjiejie_uranus_bigtts: { language: "zh-cn" },
  zh_male_gaolengchenwen_uranus_bigtts: { language: "zh-cn" },
  zh_male_shenyeboke_uranus_bigtts: { language: "zh-cn" },
  zh_male_lubanqihao_uranus_bigtts: { language: "zh-cn" },
  zh_female_jiaochuannv_uranus_bigtts: { language: "zh-cn" },
  zh_female_linxiao_uranus_bigtts: { language: "zh-cn" },
  zh_female_lingling_uranus_bigtts: { language: "zh-cn" },
  zh_female_chunribu_uranus_bigtts: { language: "zh-cn" },
  zh_male_tangseng_uranus_bigtts: { language: "zh-cn" },
  zh_male_zhuangzhou_uranus_bigtts: { language: "zh-cn" },
  zh_male_kailangdidi_uranus_bigtts: { language: "zh-cn" },
  zh_male_zhubajie_uranus_bigtts: { language: "zh-cn" },
  zh_female_ganmaodianyin_uranus_bigtts: { language: "zh-cn" },
  zh_female_chanmeinv_uranus_bigtts: { language: "zh-cn" },
  zh_female_nvleishen_uranus_bigtts: { language: "zh-cn" },
  zh_female_qinqienv_uranus_bigtts: { language: "zh-cn" },
  zh_male_kuailexiaodong_uranus_bigtts: { language: "zh-cn" },
  zh_male_kailangxuezhang_uranus_bigtts: { language: "zh-cn" },
  zh_male_youyoujunzi_uranus_bigtts: { language: "zh-cn" },
  zh_female_wenjingmaomao_uranus_bigtts: { language: "zh-cn" },
  zh_female_zhixingnv_uranus_bigtts: { language: "zh-cn" },
  zh_male_qingshuangnanda_uranus_bigtts: { language: "zh-cn" },
  zh_male_yuanboxiaoshu_uranus_bigtts: { language: "zh-cn" },
  zh_male_yangguangqingnian_uranus_bigtts: { language: "zh-cn" },
  zh_female_qingchezizi_uranus_bigtts: { language: "zh-cn" },
  zh_female_tianmeiyueyue_uranus_bigtts: { language: "zh-cn" },
  zh_female_xinlingjitang_uranus_bigtts: { language: "zh-cn" },
  zh_male_wenrouxiaoge_uranus_bigtts: { language: "zh-cn" },
  zh_female_roumeinvyou_uranus_bigtts: { language: "zh-cn" },
  zh_male_dongfanghaoran_uranus_bigtts: { language: "zh-cn" },
  zh_female_wenrouxiaoya_uranus_bigtts: { language: "zh-cn" },
  zh_male_tiancaitongsheng_uranus_bigtts: { language: "zh-cn" },
  zh_female_wuzetian_uranus_bigtts: { language: "zh-cn" },
  zh_female_gujie_uranus_bigtts: { language: "zh-cn" },
  zh_male_guanggaojieshuo_uranus_bigtts: { language: "zh-cn" },
  zh_female_shaoergushi_uranus_bigtts: { language: "zh-cn" },
  id_female_cesna_uranus_bigtts: { language: "id" },
  id_male_ikbal_uranus_bigtts: { language: "id" },
  vi_female_f01507b_uranus_bigtts: { language: "vi" },
  es_male_mariano_uranus_bigtts: { language: "es-es" },
  es_female_romina_uranus_bigtts: { language: "es-es" },
  ms_male_hazeem_uranus_bigtts: { language: "ms" },
  ms_female_qis_uranus_bigtts: { language: "ms" },
  th_male_angpao_uranus_bigtts: { language: "th" },
  th_female_elle_uranus_bigtts: { language: "th" },
  th_female_cake_uranus_bigtts: { language: "th", noInstructions: true },
  th_male_paran_uranus_bigtts: { language: "th", noInstructions: true },
  id_female_prisma_uranus_bigtts: { language: "id", noInstructions: true },
  en_male_ryan_uranus_bigtts: { language: "en", noInstructions: true },
  ja_male_yusuke_uranus_bigtts: { language: "ja", noInstructions: true },
  mx_male_migu_uranus_bigtts: { language: "es-mx", noInstructions: true },
  it_male_luca_uranus_bigtts: { language: "it", noInstructions: true },
  it_male_enzo2_uranus_bigtts: { language: "it", noInstructions: true },
  es_male_angel_uranus_bigtts: { language: "es-es", noInstructions: true },
  es_male_francisc_uranus_bigtts: { language: "es-es", noInstructions: true },
  ar_female_dina_uranus_bigtts: { language: "ar" },
  ar_female_fatma_uranus_bigtts: { language: "ar" },
  ar_male_youssef_uranus_bigtts: { language: "ar" },
  de_female_bv081_uranus_bigtts: { language: "de" },
  de_male_sven_uranus_bigtts: { language: "de", noInstructions: true },
  en_male_alberto_uranus_bigtts: { language: "en" },
  en_male_alex_uranus_bigtts: { language: "en" },
  en_female_allison_uranus_bigtts: { language: "en" },
  en_male_bill_jones_corey_uranus_bigtts: {
    language: "en",
    noInstructions: true,
  },
  en_male_brad_pitt_p1_uranus_bigtts: { language: "en" },
  en_female_brittney_uranus_bigtts: { language: "en" },
  en_female_brittney_pimintel_uranus_bigtts: {
    language: "en",
    noInstructions: true,
  },
  en_male_bruce_uranus_bigtts: { language: "en" },
  en_male_chandler_p1_uranus_bigtts: { language: "en" },
  en_male_cowboy_john_b_uranus_bigtts: { language: "en", noInstructions: true },
  en_male_david_uranus_bigtts: { language: "en" },
  en_male_diyuwenrounan_uranus_bigtts: { language: "en" },
  en_male_godfather_uranus_bigtts: { language: "en" },
  en_male_gollum_uranus_bigtts: { language: "en" },
  en_male_hades_uranus_bigtts: { language: "en" },
  en_female_hayley_uranus_bigtts: { language: "en" },
  en_male_jamie_uranus_bigtts: { language: "en" },
  en_female_jane_uranus_bigtts: { language: "en" },
  en_female_jenny_uranus_bigtts: { language: "en" },
  en_male_jidongchuanjiaoshi_uranus_bigtts: { language: "en" },
  en_male_jimmy_uranus_bigtts: { language: "en" },
  en_female_joanne_uranus_bigtts: { language: "en" },
  en_male_joker_uranus_bigtts: { language: "en" },
  en_male_josh_uranus_bigtts: { language: "en" },
  en_male_josh_coery_uranus_bigtts: { language: "en", noInstructions: true },
  en_male_kevin_uranus_bigtts: { language: "en" },
  en_male_knightley_uranus_bigtts: { language: "en" },
  en_female_lana_del_rey_kelley_d_p1_uranus_bigtts: { language: "en" },
  en_female_lana_del_rey_parky_s_p1_uranus_bigtts: { language: "en" },
  en_male_marcus_uranus_bigtts: { language: "en" },
  en_female_mel_uranus_bigtts: { language: "en" },
  en_male_michael_uranus_bigtts: { language: "en" },
  en_male_michael_kevin_uranus_bigtts: { language: "en", noInstructions: true },
  en_female_myra_uranus_bigtts: { language: "en" },
  en_female_myra_cmb_uranus_bigtts: { language: "en", noInstructions: true },
  en_female_nadia_uranus_bigtts: { language: "en" },
  en_female_natasha_uranus_bigtts: { language: "en" },
  en_female_rachel_p1_uranus_bigtts: { language: "en" },
  en_male_ronald_uranus_bigtts: { language: "en" },
  en_male_russell_uranus_bigtts: { language: "en" },
  en_female_scarlet_p1_uranus_bigtts: { language: "en" },
  en_female_sharron_uranus_bigtts: { language: "en" },
  en_male_simba_p1_uranus_bigtts: { language: "en" },
  en_female_skye_uranus_bigtts: { language: "en" },
  en_male_tom_hiddleston_p1_uranus_bigtts: { language: "en" },
  en_male_valentino_uranus_bigtts: { language: "en" },
  en_male_valentino_corey_uranus_bigtts: {
    language: "en",
    noInstructions: true,
  },
  en_female_wenrouzhishijieshuonv_uranus_bigtts: { language: "en" },
  en_female_xinwenjieshuonv_uranus_bigtts: { language: "en" },
  en_male_yangguangjieshuonan_uranus_bigtts: { language: "en" },
  en_female_zendaya_p1_uranus_bigtts: { language: "en" },
  es_female_bv084_uranus_bigtts: { language: "es-es" },
  es_male_dani_uranus_bigtts: { language: "es-es" },
  es_male_guillem_uranus_bigtts: { language: "es-es" },
  es_female_ht_mx_f6_uranus_bigtts: { language: "es-es" },
  fr_female_fr_bv078_uranus_bigtts: { language: "fr" },
  fr_female_fr_f47_uranus_bigtts: { language: "fr" },
  fr_male_fr_m29_uranus_bigtts: { language: "fr" },
  fr_male_usseau_uranus_bigtts: { language: "fr", noInstructions: true },
  id_male_bv160_uranus_bigtts: { language: "id" },
  id_male_bv160dialogue_uranus_bigtts: { language: "id" },
  id_male_bv160narration_uranus_bigtts: { language: "id" },
  id_female_bv161_uranus_bigtts: { language: "id" },
  id_female_bv161dialogue_uranus_bigtts: { language: "id" },
  id_female_bv161narration_uranus_bigtts: { language: "id" },
  id_female_bv164_uranus_bigtts: { language: "id" },
  id_male_bv164dialogue_uranus_bigtts: { language: "id" },
  id_male_bv164narration_uranus_bigtts: { language: "id" },
  id_female_f20_uranus_bigtts: { language: "id" },
  id_male_han_uranus_bigtts: { language: "id" },
  id_male_m08_uranus_bigtts: { language: "id" },
  id_female_phulia_uranus_bigtts: { language: "id" },
  ja_female_bv024_uranus_bigtts: { language: "ja" },
  ja_female_bv520_uranus_bigtts: { language: "ja" },
  ja_female_bv521_uranus_bigtts: { language: "ja" },
  ja_female_bv522_uranus_bigtts: { language: "ja" },
  ja_female_bv523_uranus_bigtts: { language: "ja" },
  ja_male_bv524_uranus_bigtts: { language: "ja" },
  ja_female_minimi_uranus_bigtts: { language: "ja", noInstructions: true },
  ja_female_shirou_uranus_bigtts: { language: "ja" },
  ko_male_bv545_uranus_bigtts: { language: "ko" },
  ko_female_bv546_uranus_bigtts: { language: "ko" },
  ko_male_m03_uranus_bigtts: { language: "ko" },
  ko_male_shane_uranus_bigtts: { language: "ko", noInstructions: true },
  ms_male_ham_uranus_bigtts: { language: "ms" },
  ms_male_naim_uranus_bigtts: { language: "ms" },
  mx_female_bv065_uranus_bigtts: { language: "es-mx" },
  mx_male_bv165dialogue_uranus_bigtts: { language: "es-mx" },
  mx_male_bv165narrator_uranus_bigtts: { language: "es-mx" },
  mx_female_bv166dialogue_uranus_bigtts: { language: "es-mx" },
  mx_female_bv166emotion_uranus_bigtts: { language: "es-mx" },
  mx_female_bv166narrator_uranus_bigtts: { language: "es-mx" },
  mx_male_felipe_uranus_bigtts: { language: "es-mx", noInstructions: true },
  mx_male_ht_mx_m012_uranus_bigtts: { language: "es-mx" },
  mx_female_leslie_uranus_bigtts: { language: "es-mx" },
  mx_male_marcelo_uranus_bigtts: { language: "es-mx" },
  pt_male_bv172_uranus_bigtts: { language: "pt-br" },
  pt_male_bv172dialogue_uranus_bigtts: { language: "pt-br" },
  pt_male_bv172emotion_uranus_bigtts: { language: "pt-br" },
  pt_male_bv172narrator_uranus_bigtts: { language: "pt-br" },
  pt_female_bv173_uranus_bigtts: { language: "pt-br" },
  pt_female_bv173dialogue_uranus_bigtts: { language: "pt-br" },
  pt_female_bv173emotion_uranus_bigtts: { language: "pt-br" },
  pt_female_bv173narrator_uranus_bigtts: { language: "pt-br" },
  pt_female_bv530_uranus_bigtts: { language: "pt-br" },
  pt_male_bv531_uranus_bigtts: { language: "pt-br" },
  pt_female_mari_uranus_bigtts: { language: "pt-br" },
  pt_male_martins_uranus_bigtts: { language: "pt-br", noInstructions: true },
  pt_male_rael_uranus_bigtts: { language: "pt-br" },
  ru_female_af07_uranus_bigtts: { language: "ru" },
  ru_female_irinae_uranus_bigtts: { language: "ru" },
  ru_male_pavel_uranus_bigtts: { language: "ru" },
  ru_female_sophie_uranus_bigtts: { language: "ru" },
  ru_male_vlad_uranus_bigtts: { language: "ru" },
  th_female_bv568_angry_uranus_bigtts: { language: "th" },
  th_female_bv568_fear_uranus_bigtts: { language: "th" },
  th_female_bv568_happy_uranus_bigtts: { language: "th" },
  th_female_bv568_hate_uranus_bigtts: { language: "th" },
  th_female_bv568_neutral_uranus_bigtts: { language: "th" },
  th_female_bv568_sad_uranus_bigtts: { language: "th" },
  th_female_bv568_suprise_uranus_bigtts: { language: "th" },
  tl_female_annika_uranus_bigtts: { language: "fil" },
  tl_male_ed_uranus_bigtts: { language: "fil" },
  tl_female_hervie_uranus_bigtts: { language: "fil" },
  vi_female_hong_uranus_bigtts: { language: "vi" },
  vi_female_ling_uranus_bigtts: { language: "vi" },
  vi_female_linh_uranus_bigtts: { language: "vi" },
  vi_female_partner_uranus_bigtts: { language: "vi" },
  vi_female_ruan_uranus_bigtts: { language: "vi" },
  vi_female_wu_uranus_bigtts: { language: "vi" },
  vi_male_wumg_uranus_bigtts: { language: "vi" },
  it_male_enzo_uranus_bigtts: { language: "it", noInstructions: true },
};
const LANGUAGES = {
  "seed-tts-2.0": [
    "zh-cn",
    "en",
    "ja",
    "es-mx",
    "id",
    "pt-br",
    "pt",
    "ko",
    "it",
    "de",
    "fr",
    "th",
    "vi",
    "ru",
    "fil",
    "ms",
    "ar",
    "pl",
    "tr",
    "sv",
    "nl",
    "no",
    "uk",
    "fi",
    "da",
    "cs",
    "hu",
    "el",
    "ro",
    "hi",
    "es-es",
  ],
  "seed-audio-1.0": [
    "zh-cn",
    "en",
    "ja",
    "ko",
    "es-mx",
    "es-es",
    "de",
    "fr",
    "pt-br",
    "th",
    "vi",
    "ms",
    "fil",
    "it",
    "ru",
    "nl",
    "pl",
    "tr",
  ],
};
const DIALECTS = [
  "beijing",
  "dongbei",
  "henan",
  "shaanxi",
  "shanghai",
  "sichuan",
  "tianjin",
  "yue",
];
const BIT_RATES = [16000, 32000, 64000, 160000];
function control(value, min, max, label) {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < min || value > max)
  )
    throw new Error(`${label} must be between ${min} and ${max}.`);
}
function validate(input) {
  if (!LANGUAGES[input.model]) throw new Error("Unknown Doubao audio model.");
  if (input.language && !LANGUAGES[input.model].includes(input.language))
    throw new Error("Unsupported audio language.");
  control(input.speed, -50, 100, "Speech rate");
  control(input.pitch, -12, 12, "Pitch");
  control(input.volume, -50, 100, "Volume");
}
function speech(input) {
  if (!input.voiceId)
    throw new Error("Choose a Speaker ID or configure a default voice.");
  control(input.silenceMs, 0, 30000, "Trailing silence");
  if (input.bitRate !== undefined && !BIT_RATES.includes(input.bitRate))
    throw new Error("Unsupported audio bit rate.");
  const cloned = input.voiceKind === "cloned";
  const preset =
    !cloned && Object.prototype.hasOwnProperty.call(PRESETS, input.voiceId)
      ? PRESETS[input.voiceId]
      : undefined;
  if ((cloned || preset?.noInstructions) && input.style)
    throw new Error("This voice does not support delivery instructions.");
  if (input.voiceModel && !cloned)
    throw new Error("Voice model selection requires a cloned voice.");
  if (
    input.dialect &&
    (!DIALECTS.includes(input.dialect) || (preset && !preset.dialects))
  )
    throw new Error("This voice does not support the selected dialect.");
  if (input.ssml && input.pronunciation?.length)
    throw new Error("Use SSML or a pronunciation dictionary separately.");
  if (input.ssml && preset && !["zh-cn", "en"].includes(preset.language))
    throw new Error("SSML requires a Chinese or English voice.");
  if (input.pronunciation?.length) {
    const words = new Set();
    if (input.pronunciation.length > 5000)
      throw new Error("Pronunciation dictionary is too large.");
    for (const entry of input.pronunciation) {
      if (
        !entry.word ||
        entry.word.length > 9 ||
        /[\s/]/.test(entry.word) ||
        !entry.replacement ||
        words.has(entry.word)
      )
        throw new Error("Invalid or duplicate pronunciation entry.");
      words.add(entry.word);
    }
  }
  const additions = {};
  if (input.language) additions.explicit_language = input.language;
  if (input.style?.trim()) additions.context_texts = [input.style.trim()];
  if (input.autoLanguage) additions.enable_auto_language_recognition = true;
  if (input.dialect) additions.explicit_dialect = input.dialect;
  if (input.pitch !== undefined)
    additions.post_process = { pitch: input.pitch };
  if (input.silenceMs !== undefined)
    additions.silence_duration = input.silenceMs;
  if (input.sectionId) additions.section_id = input.sectionId;
  if (input.ssml) additions.disable_markdown_filter = false;
  if (input.pronunciation?.length)
    additions.pronunciation_dict = {
      tone: input.pronunciation.map(
        (entry) => `${entry.word}/${entry.replacement}`,
      ),
    };
  if (input.bitRate !== undefined && input.bitRate < 64000)
    additions.disable_default_bit_rate = true;
  return {
    req_params: {
      text: input.prompt.trim(),
      speaker: input.voiceId,
      ...(cloned
        ? { model: `seed-tts-2.0-${input.voiceModel ?? "standard"}` }
        : {}),
      ...(input.ssml ? { ssml: input.ssml } : {}),
      audio_params: {
        format: input.format,
        sample_rate:
          input.sampleRate ?? (input.format === "ogg_opus" ? 48000 : 24000),
        ...(input.volume !== undefined ? { loudness_rate: input.volume } : {}),
        ...(input.bitRate !== undefined ? { bit_rate: input.bitRate } : {}),
        ...(input.speed !== undefined ? { speech_rate: input.speed } : {}),
      },
      ...(Object.keys(additions).length
        ? { additions: JSON.stringify(additions) }
        : {}),
    },
  };
}
function scene(input) {
  if (
    input.durationSeconds !== undefined &&
    (!Number.isFinite(input.durationSeconds) ||
      input.durationSeconds <= 0 ||
      input.durationSeconds > 120)
  )
    throw new Error(
      "Target duration must be greater than 0 and no more than 120 seconds.",
    );
  const text = `${input.durationSeconds !== undefined ? `Create audio approximately ${input.durationSeconds} seconds long. ` : ""}${input.language ? `Language: ${input.language}. ` : ""}${input.style?.trim() ? `Delivery: ${input.style.trim()}. ` : ""}${input.prompt.trim()}`;
  if (text.length > 3000)
    throw new Error(
      "The combined prompt, style and instructions exceed 3000 characters.",
    );
  return {
    model: input.model,
    text_prompt: text,
    ...(input.voiceId ? { references: [{ speaker: input.voiceId }] } : {}),
    audio_config: {
      format: input.format,
      sample_rate: input.sampleRate ?? 48000,
      pitch_rate: input.pitch ?? 0,
      speech_rate: input.speed ?? 0,
      loudness_rate: input.volume ?? 0,
    },
    watermark: { aigc_watermark: false, aigc_metadata: { enable: true } },
  };
}
export default {
  audio: {
    async start(input, host) {
      validate(input);
      const tts = input.model === "seed-tts-2.0";
      const body = tts ? speech(input) : scene(input);
      const response = await host.submit(
        "generate-audio",
        `${API}/${tts ? "unidirectional" : "create"}`,
        {
          method: "POST",
          auth: true,
          json: body,
          responseType: "file",
          requestIdHeader: "X-Api-Request-Id",
          ...(tts
            ? {
                headers: {
                  "X-Api-Resource-Id":
                    input.voiceKind === "cloned"
                      ? "seed-icl-2.0"
                      : "seed-tts-2.0",
                  "X-Control-Require-Usage-Tokens-Return": "*",
                },
              }
            : {}),
          decode: {
            format: tts ? "jsonl" : "json",
            audioField: tts ? "data" : "audio",
            statusField: "code",
            ...(tts ? {} : { statusOnlyOnError: true }),
            successCodes: [0, 20000000],
          },
        },
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        return {
          error: `Doubao HTTP ${response.status}: ${String(detail?.message ?? detail?.error ?? "Request failed").slice(0, 700)}`,
        };
      }
      const meta = response.metadata;
      const usage = meta?.usage?.text_words;
      const duration = meta?.original_duration;
      // The host validates these fields and keeps them with the same paid receipt.
      if (
        duration !== undefined &&
        (typeof duration !== "number" ||
          !Number.isFinite(duration) ||
          duration < 0)
      )
        throw new Error("Doubao returned an invalid original duration.");
      return {
        outputs: [
          {
            ...(await response.file()),
            requestId: response.headers["x-tt-logid"] || response.requestId,
            ...(usage !== undefined ? { usageCharacters: usage } : {}),
            ...(duration !== undefined
              ? { originalDurationMs: Math.round(duration * 1000) }
              : {}),
          },
        ],
      };
    },
  },
};
