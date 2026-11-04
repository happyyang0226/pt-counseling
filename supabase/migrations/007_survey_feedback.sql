-- 007: 결제 없는 '선제 상담 피드백'
-- 문항마다 등급(green 일반 / yellow 관심 / red 긴급)과 교수님이 미리 써 둔 피드백(tip)을 두고,
-- 신청서의 최종 등급을 서버에서 계산합니다. (외부 AI 호출 없음)
-- 등급 기준: docs/AI_선제상담_설문설계.md 2~5절. 학생 화면에는 등급을 보여 주지 않습니다.

-- 1) 문항 등급과 피드백
alter table public.cs_items add column if not exists grade text not null default 'green'
  check (grade in ('green','yellow','red'));
alter table public.cs_items add column if not exists tip text;

-- 설계 문서에 있고 지금 문항에 없던 항목 추가
insert into public.cs_items (id, kind, area_id, label, sort, active) values
  ('relation.alone',  'concern', 'relation', '늘 혼자 있는 것 같아요', 7, true),
  ('relation.bully',  'concern', 'relation', '괴롭힘이나 따돌림을 당하고 있어요', 8, true),
  ('mind.giveup',     'concern', 'mind',     '너무 힘들어서 다 포기하고 싶어요', 7, true),
  ('mind.selfharm',   'concern', 'mind',     '나를 해치고 싶은 생각이 들어요', 8, true),
  ('school.quit',     'concern', 'school',   '학교를 그만두고 싶어요 (자퇴 고민)', 7, true),
  ('life.crisis',     'concern', 'life',     '당장 생활이 어려울 정도예요', 7, true)
on conflict (id) do nothing;

-- 등급과 피드백 (교수 화면 '설문 문항·피드백'에서 언제든 고칠 수 있음)
update public.cs_items i set grade = v.grade, tip = v.tip from (values
  -- 공부·성적
  ('study.focus',    'green',  '집중이 안 되는 날은 누구에게나 있어요. 25분 공부하고 5분 쉬는 방법으로 짧게 시작해 보고, 휴대폰은 손이 닿지 않는 곳에 두면 도움이 돼요.'),
  ('study.method',   'green',  '공부 방법은 사람마다 달라서 찾아가는 과정이 필요해요. 수업이 끝난 날 핵심 세 줄만 내 말로 정리해 보세요. 상담 때 과목별로 같이 맞춰 봐요.'),
  ('study.exam',     'green',  '시험이 부담되는 건 잘하고 싶은 마음이 있어서예요. 시험 날까지 남은 날을 나눠 하루에 할 양을 작게 정해 보세요. 계획을 같이 세워 볼 수 있어요.'),
  ('study.grade',    'yellow', '성적이 기대보다 낮으면 마음이 많이 쓰이죠. 어느 과목, 어떤 부분에서 점수가 빠졌는지 먼저 적어 보세요. 다음 상담 때 꼭 같이 살펴볼게요.'),
  ('study.practice', 'green',  '과제나 실습이 버거울 때는 혼자 붙잡고 있기보다 일찍 물어보는 게 좋아요. 막히는 부분을 메모해 두면 상담 때 하나씩 풀어 갈 수 있어요.'),
  ('study.fit',      'yellow', '전공이 나와 맞는지 고민하는 건 진지하게 생각하고 있다는 뜻이에요. 좋았던 수업과 힘들었던 수업을 각각 적어 보세요. 상담 때 천천히 이야기해요.'),
  -- 진로·취업
  ('career.unknown', 'green',  '아직 하고 싶은 걸 모르는 건 1학년에게 아주 자연스러운 일이에요. 요즘 재미있었던 수업이나 활동을 세 가지만 떠올려 보세요. 거기서부터 같이 찾아봐요.'),
  ('career.job',     'green',  '물리치료사는 병원, 스포츠, 지역사회 등 일하는 곳이 다양해요. 관심 가는 분야를 하나 골라 오면 상담 때 실제 모습을 이야기해 줄게요.'),
  ('career.major',   'yellow', '전공을 계속할지 고민되는 마음, 혼자 결정하지 않아도 돼요. 언제부터, 어떤 때 그런 생각이 드는지 적어 두세요. 다음 상담 때 꼭 이야기 나눠요.'),
  ('career.start',   'green',  '취업 준비는 지금 수업을 잘 듣는 것부터가 시작이에요. 학과 공지와 실습 정보를 놓치지 않게 알림을 켜 두세요. 단계별로 무엇을 할지 상담 때 정리해요.'),
  ('career.cert',    'green',  '국가고시와 자격증은 일찍 계획할수록 여유가 생겨요. 지금은 전공 기초 과목을 탄탄히 하는 게 가장 좋은 준비예요. 시기별 계획은 상담 때 같이 짜요.'),
  ('career.resume',  'green',  '이력서와 면접은 연습할수록 좋아져요. 지금까지 한 활동을 날짜와 함께 한곳에 모아 두세요. 상담 때 함께 다듬어 볼 수 있어요.'),
  -- 학교생활
  ('school.adapt',   'yellow', '새 환경에 적응하는 데는 시간이 걸려요. 학교에서 편하게 있을 수 있는 장소나 사람을 하나 찾아보세요. 어떤 점이 가장 힘든지 상담 때 꼭 들려줘요.'),
  ('school.burden',  'yellow', '학교 가는 게 부담스러운 날이 이어지면 혼자 견디기 힘들어요. 무엇이 가장 부담되는지 짧게라도 적어 두세요. 다음 상담 때 꼭 같이 이야기해요.'),
  ('school.attend',  'yellow', '출석과 시간 관리는 작은 습관에서 시작해요. 내일 할 일 세 가지만 전날 밤에 적어 보세요. 결석이 늘고 있다면 상담 때 방법을 같이 찾아요.'),
  ('school.clinical','green',  '실습은 처음엔 누구나 긴장돼요. 실습 전에 할 일과 준비물을 체크리스트로 만들어 두면 마음이 한결 편해요. 걱정되는 장면을 상담 때 미리 이야기해 봐요.'),
  ('school.leave',   'yellow', '휴학이나 복학은 학점, 장학, 일정과 이어져 있어서 미리 알아 두면 좋아요. 결정하기 전에 꼭 교수님과 먼저 이야기해요.'),
  ('school.continue','yellow', '학업을 계속할지 고민될 만큼 힘들었다면 그동안 많이 애썼을 거예요. 혼자 결정하지 말고 다음 상담 때 꼭 이야기 나눠요.'),
  ('school.quit',    'red',    null),
  -- 친구·대인관계
  ('relation.make',     'green',  '친구 사귀기는 생각보다 많은 사람이 어려워해요. 조별 활동이나 동아리처럼 같은 일을 하는 자리에서 먼저 짧게 인사해 보세요.'),
  ('relation.conflict', 'yellow', '친구와의 갈등은 마음을 오래 무겁게 해요. 무슨 일이 있었는지, 내 마음은 어땠는지 나눠서 적어 보세요. 상담 때 함께 정리해요.'),
  ('relation.seniors',  'green',  '선후배 관계는 처음에 거리감이 있는 게 보통이에요. 궁금한 걸 짧게 물어보는 것부터 시작해 보세요. 어려운 상황이 있으면 상담 때 이야기해요.'),
  ('relation.professor','green',  '교수님께 말 걸기 어려운 건 당연해요. 여기 상담 신청처럼 글로 먼저 시작해도 괜찮아요. 편한 방식으로 이야기해요.'),
  ('relation.family',   'yellow', '가족과의 갈등은 학교생활에도 영향을 줘요. 요즘 가장 마음에 걸리는 일을 하나만 적어 보세요. 다음 상담 때 꼭 들어 볼게요.'),
  ('relation.dating',   'green',  '연애 고민은 혼자 오래 생각할수록 커지기 쉬워요. 내 마음과 상대의 마음을 나눠서 적어 보면 정리에 도움이 돼요. 편하게 이야기해요.'),
  ('relation.alone',    'yellow', '늘 혼자인 것 같은 느낌은 정말 외로워요. 이렇게 말해 줘서 고마워요. 다음 상담 때 꼭 이야기 나눠요.'),
  ('relation.bully',    'red',    null),
  -- 마음·스트레스
  ('mind.stress',     'green',  '스트레스가 쌓일 때는 몸을 먼저 쉬게 해 주세요. 10분 산책, 좋아하는 음악, 충분한 잠처럼 작은 것부터 해 봐요. 무엇이 스트레스인지 상담 때 같이 살펴요.'),
  ('mind.anxiety',    'yellow', '걱정이 많을 때는 걱정을 종이에 적어 두는 것만으로도 조금 가벼워져요. 불안이 자주 찾아온다면 혼자 견디지 말고 다음 상담 때 꼭 이야기해요.'),
  ('mind.mood',       'yellow', '기분이 가라앉고 의욕이 없는 날이 이어지면 많이 지쳐 있을 수 있어요. 오늘 할 일을 아주 작게 하나만 정해 보세요. 다음 상담 때 꼭 이야기 나눠요.'),
  ('mind.confidence', 'green',  '자신감은 작은 성공이 쌓이면서 돌아와요. 이번 주에 잘한 일을 하루 하나씩 적어 보세요. 상담 때 그 이야기도 들려줘요.'),
  ('mind.emotion',    'yellow', '감정이 크게 흔들릴 때는 잠깐 자리를 옮기고 천천히 숨을 쉬어 보세요. 어떤 때 그런지 상담 때 함께 살펴볼게요.'),
  ('mind.sleep',      'yellow', '잠과 생활 리듬이 흐트러지면 몸과 마음이 다 지쳐요. 일어나는 시간을 먼저 일정하게 맞춰 보세요. 다음 상담 때 꼭 이야기해요.'),
  ('mind.giveup',     'red',    null),
  ('mind.selfharm',   'red',    null),
  -- 경제·생활
  ('life.tuition',    'yellow', '등록금과 생활비 부담은 공부에도 영향을 줘요. 학교 장학금과 학자금 지원 제도를 함께 알아볼 수 있어요. 다음 상담 때 꼭 이야기해요.'),
  ('life.scholarship','green',  '장학금 공지는 학교 누리집과 학과 공지에 자주 올라와요. 알림을 켜 두고, 성적·소득 기준을 미리 확인해 두세요. 상담 때 함께 찾아봐요.'),
  ('life.parttime',   'yellow', '아르바이트와 공부를 함께 하는 건 정말 힘든 일이에요. 일주일 시간표에 수업과 일을 같이 적어 보세요. 수업에 지장이 있다면 상담 때 꼭 이야기해요.'),
  ('life.housing',    'green',  '기숙사나 자취는 생활 리듬을 스스로 만들어야 해서 처음엔 어려워요. 식사와 잠 시간부터 정해 보세요. 불편한 점은 상담 때 이야기해요.'),
  ('life.commute',    'green',  '통학이 길면 쉽게 지쳐요. 이동 시간에 짧은 복습이나 휴식처럼 할 일을 정해 두면 덜 힘들어요. 시간표 조정이 필요하면 상담 때 같이 봐요.'),
  ('life.health',     'yellow', '몸이 편해야 공부도 잘 돼요. 식사, 잠, 운동 중 하나만 먼저 챙겨 보세요. 아픈 곳이 계속되면 꼭 병원에 가 보고, 다음 상담 때 이야기해요.'),
  ('life.crisis',     'red',    null),
  -- 잘 모르겠어요
  ('unsure.mixed',    'green',  '여러 고민이 섞여 있을 땐 하나씩 꺼내 보는 게 좋아요. 떠오르는 대로 단어만 적어 와도 괜찮아요. 상담 때 함께 정리해요.'),
  ('unsure.explain',  'green',  '무엇이 힘든지 설명하기 어려운 것도 자연스러워요. 잘 정리하지 않아도 괜찮으니 편하게 와 주세요.'),
  ('unsure.listen',   'yellow', '이야기하고 싶은 마음을 꺼내 줘서 고마워요. 교수님이 직접 이야기를 들을게요. 편한 시간에 만나요.'),
  ('unsure.organize', 'green',  '상담하면서 함께 정리하면 돼요. 지금 떠오르는 생각을 한두 줄만 적어 와도 충분해요.')
) as v(id, grade, tip) where i.id = v.id;

-- 2) 신청서 등급·회차·교수 확인
alter table public.cs_requests add column if not exists risk_grade text not null default 'green'
  check (risk_grade in ('green','yellow','red'));
alter table public.cs_requests add column if not exists round int;
alter table public.cs_requests add column if not exists ack_at timestamptz;

-- 3) 신청 저장 때 서버가 최종 등급 계산 (기존 검사는 그대로, 끝부분에 등급 계산만 추가)
create or replace function public.cs_prepare_request()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare v_bad text; v_rank int := 0; v_sem date; t date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not public.cs_is_admin() then
    new.status := '대기';
    new.public_summary := null;
    new.ack_at := null;
  end if;
  if new.entry_area_id is not null and not exists (select 1 from cs_items where id = new.entry_area_id and kind = 'area') then
    raise exception '알 수 없는 시작 분야입니다.'; end if;
  if new.area_id is not null then
    if not exists (select 1 from cs_items where id = new.area_id and kind = 'area') then
      raise exception '알 수 없는 상담분야입니다.'; end if;
    select string_agg(c, ',') into v_bad from unnest(new.concern_ids) c
      where not exists (select 1 from cs_items i where i.id = c and i.kind in ('concern','common'));
    if v_bad is not null then raise exception '알 수 없는 고민 항목입니다: %', v_bad; end if;
    if new.first_concern_id is not null and new.first_concern_id <> 'first.later'
       and not (new.first_concern_id = any(new.concern_ids)) then
      raise exception '먼저 이야기할 고민은 선택한 고민 중에서 골라야 합니다.'; end if;
    if new.since_id is not null and not exists (select 1 from cs_items where id = new.since_id and kind = 'since') then
      raise exception '알 수 없는 응답입니다(시작 시기).'; end if;
    if new.impact_id is not null and not exists (select 1 from cs_items where id = new.impact_id and kind = 'impact') then
      raise exception '알 수 없는 응답입니다(영향 정도).'; end if;
    select string_agg(h, ',') into v_bad from unnest(new.help_ids) h
      where not exists (select 1 from cs_items i where i.id = h and i.kind = 'help');
    if v_bad is not null then raise exception '알 수 없는 응답입니다(원하는 도움): %', v_bad; end if;
    if new.mode_id is null or not exists (select 1 from cs_items where id = new.mode_id and kind = 'mode') then
      raise exception '상담 방식을 골라 주세요.'; end if;
    new.topic := (select label from cs_items where id = new.area_id);
    new.mode := (select hint from cs_items where id = new.mode_id);
  end if;
  new.crisis_flag := (coalesce(new.concern,'') || ' ' || coalesce(new.other_concern,''))
    ~ '(죽고\s*싶|죽을\s*것\s*같|자살|자해|극단적|사라지고\s*싶|살기\s*싫|살고\s*싶지\s*않|해치고\s*싶|목숨)';

  -- 최종 등급 = 고른 문항 등급, 영향 정도, 직접 쓴 글 중 가장 높은 것 (낮출 수 없음)
  select coalesce(max(case i.grade when 'red' then 2 when 'yellow' then 1 else 0 end), 0) into v_rank
    from cs_items i where i.id = any(coalesce(new.concern_ids, '{}'));
  if new.impact_id = 'impact.very' then v_rank := greatest(v_rank, 2);
  elsif new.impact_id = 'impact.much' then v_rank := greatest(v_rank, 1); end if;
  if new.crisis_flag then v_rank := 2; end if;
  new.risk_grade := (array['green','yellow','red'])[v_rank + 1];

  -- 이번 학기 몇 번째 상담인지 (1~3)
  v_sem := case when extract(month from t) >= 9 then make_date(extract(year from t)::int, 9, 1)
                when extract(month from t) >= 3 then make_date(extract(year from t)::int, 3, 1)
                else make_date(extract(year from t)::int - 1, 9, 1) end;
  if new.round is null then
    new.round := least(3, 1 + (select count(*) from cs_notes n where n.student_id = new.student_id and n.counsel_date >= v_sem));
  end if;
  return new;
end;
$function$;
