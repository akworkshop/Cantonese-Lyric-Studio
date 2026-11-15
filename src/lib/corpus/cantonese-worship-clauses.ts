/**
 * 粵語敬拜詩歌高密度句式語料庫（3～7字自然完整句式）
 * 透過嚴謹粵語語法結構（主謂賓、狀中、介賓、處境＋回應）系統化產生，
 * 徹底杜絕「名詞硬拼」或「句尾懸空」，大幅提升各 0243 音階的原生整句覆蓋率。
 */

function buildCuratedWorshipClauses(): string[] {
  const out = new Set<string>();

  // === 1. 3字自然完整短句：[主/神/祢] + [及物/不及物動詞] ===
  const divineSubjects = ['主', '神', '祢'];
  const divineVerbs = [
    '知道', '看顧', '帶領', '保守', '醫治', '釋放', '安慰', '賜福', '拯救', '赦免',
    '接納', '了解', '明白', '掌權', '作王', '得勝', '同行', '同在', '扶持', '保護',
    '護佑', '引領', '指引', '照亮', '潔淨', '更新', '陶造', '揀選', '呼召', '應許',
    '垂聽', '賜下', '賜力', '賜愛', '顯現', '降臨', '代求', '成全', '護庇', '遮蓋',
    '撫慰', '托住', '引導', '開路', '恩待', '憐憫', '垂憐', '顧念', '記念', '復興',
  ];
  for (const s of divineSubjects) {
    for (const v of divineVerbs) {
      out.add(`${s}${v}`);
    }
  }

  // [我/心/齊/同/來] + [2字敬拜動詞]
  const humanSubjects = ['我', '心', '齊', '同', '來'];
  const worshipVerbs = [
    '敬拜', '讚美', '頌讚', '歌頌', '稱謝', '感謝', '愛慕', '渴慕', '仰望', '信靠',
    '倚靠', '投靠', '順服', '跟從', '跟隨', '事奉', '祈求', '禱告', '呼求', '等候',
    '靜候', '默想', '記念', '尋求', '親近', '高舉', '尊崇', '宣揚', '傳揚', '宣告',
    '見證', '奉獻', '擺上', '歌唱', '歡呼', '頌揚', '歸向', '感恩', '立志', '盼望',
  ];
  for (const s of humanSubjects) {
    for (const v of worshipVerbs) {
      // 「心歌唱」「心立志」等保留自然搭配；排除「齊感恩」「來立志」等略彆扭者
      if (s === '來' && ['感恩', '立志', '盼望', '默想', '記念'].includes(v)) continue;
      if (s === '齊' && ['默想', '祈求', '等候', '靜候'].includes(v)) continue;
      out.add(`${s}${v}`);
    }
  }

  // === 2. 4字自然完整短句（覆蓋各式 0243 組合） ===
  // 2a. [修飾/心態] + [2字敬拜動詞]
  const attitudePrefixes = [
    '我心', '全心', '同心', '齊心', '清心', '真心', '甘心', '專心', '誠心', '盡心',
    '定睛', '俯伏', '屈膝', '高聲', '齊聲', '放膽', '一生', '永遠', '天天', '時刻',
    '靜靜', '默默', '切切', '深深', '歡欣', '謙卑', '堅心',
  ];
  for (const p of attitudePrefixes) {
    for (const v of worshipVerbs) {
      if (
        ['俯伏', '屈膝'].includes(p) &&
        ['歌唱', '歡呼', '宣揚', '傳揚', '見證', '擺上'].includes(v)
      ) {
        continue;
      }
      if (
        ['高聲', '齊聲'].includes(p) &&
        ['靜候', '默想', '等候', '順服', '擺上', '奉獻', '尋求', '親近'].includes(v)
      ) {
        continue;
      }
      if (
        ['靜靜', '默默'].includes(p) &&
        ['歡呼', '高舉', '宣揚', '傳揚', '宣告', '歌唱'].includes(v)
      ) {
        continue;
      }
      out.add(`${p}${v}`);
    }
  }

  // 2b. [主恩/主愛/神恩/神愛/天父/救主/基督/聖靈/真光/活水/恩雨] + [2字作為]
  const graceSubjects = [
    '主恩', '主愛', '神恩', '神愛', '天父', '救主', '基督', '聖靈', '真光', '活水', '恩雨',
  ];
  const graceActions = [
    '同在', '同行', '引領', '帶領', '保守', '看顧', '扶持', '安慰', '醫治', '釋放',
    '拯救', '照亮', '充滿', '澆灌', '滋潤', '更新', '常存', '永存', '不變', '降臨',
    '顯現', '彰顯', '湧流', '護庇', '遮蓋', '觸摸', '感動', '喚醒', '復興',
  ];
  for (const s of graceSubjects) {
    for (const a of graceActions) {
      if (['活水', '恩雨'].includes(s) && ['掌權', '作王', '看顧', '拯救', '保護'].includes(a)) {
        continue;
      }
      if (['真光'].includes(s) && ['湧流', '澆灌', '滋潤', '復活'].includes(a)) {
        continue;
      }
      out.add(`${s}${a}`);
    }
  }

  // 2c. [處境2字 + 裡/中] -> 轉 5字：[在] + [處境2字] + [裡/中] + [2字回應]
  const scenes = ['風浪', '黑夜', '幽谷', '曠野', '患難', '試煉', '軟弱', '迷霧', '塵世', '主愛', '主恩', '聖殿'];
  const sceneResponses = [
    '安息', '安穩', '得力', '得勝', '仰望', '信靠', '歌唱', '讚美', '感恩', '站立',
    '前行', '重生', '更新', '釋放', '禱告', '等候', '靜候', '呼求', '守望',
  ];
  for (const sc of scenes) {
    const loc = ['主愛', '主恩', '風浪', '黑夜', '幽谷', '曠野', '軟弱'].includes(sc) ? '裡' : '中';
    for (const r of sceneResponses) {
      out.add(`在${sc}${loc}${r}`);
    }
  }

  // === 3. 5字自然完整句子：[主/神/祢] + [2字動詞] + [2字受詞] ===
  const fiveCharVerbs = [
    '照亮', '安慰', '引導', '帶領', '保守', '看顧', '扶持', '醫治', '釋放', '拯救',
    '潔淨', '更新', '充滿', '擁抱', '觸摸', '護庇', '遮蓋', '喚醒', '堅固', '改變',
  ];
  const fiveCharObjects = ['我心', '我靈', '我路', '前路', '我們', '世人', '萬民', '全地', '生命'];
  for (const s of divineSubjects) {
    for (const v of fiveCharVerbs) {
      for (const o of fiveCharObjects) {
        if (['照亮', '更新', '潔淨'].includes(v) && o === '我們') continue;
        out.add(`${s}${v}${o}`);
      }
    }
  }

  // 5字：[心態2字] + [2字敬拜動詞] + [祢/主/神]
  const fiveHumanAttitudes = ['全心', '同心', '齊心', '清心', '真心', '甘心', '一生', '永遠', '屈膝', '高聲'];
  const fiveHumanVerbs = ['敬拜', '讚美', '愛慕', '信靠', '仰望', '跟從', '順服', '事奉', '感謝', '歌頌', '高舉', '尊崇'];
  for (const att of fiveHumanAttitudes) {
    for (const v of fiveHumanVerbs) {
      if (att === '高聲' && ['順服', '跟從', '信靠', '仰望', '事奉'].includes(v)) continue;
      if (att === '屈膝' && ['高舉', '歌頌'].includes(v)) continue;
      for (const target of ['祢', '主', '神']) {
        out.add(`${att}${v}${target}`);
      }
    }
  }

  // === 4. 6字自然完整句子 ===
  // [我/願] + [一生/永遠/全心/同心/清心/真心/甘心] + [敬拜/讚美/愛慕/信靠/仰望/跟從/順服/事奉/感謝/歌頌] + [祢]
  const sixAttitudes = ['一生', '永遠', '全心', '同心', '清心', '真心', '甘心'];
  for (const lead of ['我', '願']) {
    for (const att of sixAttitudes) {
      if (lead === '我' && att === '同心') continue;
      for (const v of fiveHumanVerbs) {
        out.add(`${lead}${att}${v}祢`);
      }
    }
  }

  // [在] + [風浪/黑夜/幽谷/曠野/患難] + [裡/中] + [我] + [仰望/信靠/讚美/感恩/前行/站立]
  for (const sc of ['風浪', '黑夜', '幽谷', '曠野', '患難', '試煉']) {
    const loc = ['風浪', '黑夜', '幽谷', '曠野'].includes(sc) ? '裡' : '中';
    for (const r of ['仰望', '信靠', '讚美', '感恩', '前行', '站立', '禱告', '等候']) {
      out.add(`在${sc}${loc}仍${r}`);
      out.add(`在${sc}${loc}我${r}`);
    }
  }

  // === 5. 7字自然完整句子 ===
  // [風浪/黑夜/幽谷/曠野/患難/試煉] + [裡/中] + [我仍/仍舊/全心] + [仰望/信靠/讚美/跟從] + [祢/主]
  for (const sc of ['風浪', '黑夜', '幽谷', '曠野', '患難', '試煉']) {
    const loc = ['風浪', '黑夜', '幽谷', '曠野'].includes(sc) ? '裡' : '中';
    for (const mid of ['我仍', '仍舊', '全心']) {
      for (const v of ['仰望', '信靠', '讚美', '跟從', '敬拜', '感謝']) {
        out.add(`${sc}${loc}${mid}${v}祢`);
      }
    }
  }
  for (const line of [
    '一生一世全心愛祢',
    '我願一生全心愛祢',
    '靜候主前全心仰望',
    '主恩深廣永不改變',
    '神愛世人直到永遠',
    '求主拖帶走過風浪',
    '靠著主愛跨過黑暗',
    '主手牽引走過幽谷',
    '全地萬民同心敬拜',
    '舉起雙手高聲讚美',
    '黑夜過後必見晨曦',
    '在祢愛裡得享安息',
    '在主恩中重獲新生',
    '願我此生單單屬祢',
    '賜我力量勇敢前行',
  ]) {
    out.add(line);
  }

  return Array.from(out);
}

export const CANTONESE_WORSHIP_CLAUSES_CORPUS: string[] = buildCuratedWorshipClauses();
