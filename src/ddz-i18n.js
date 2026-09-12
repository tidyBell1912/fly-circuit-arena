export const languages={zh:{name:'中文',flag:'🇨🇳'},en:{name:'English',flag:'🇺🇸'},ko:{name:'한국어',flag:'🇰🇷'},ja:{name:'日本語',flag:'🇯🇵'},vi:{name:'Tiếng Việt',flag:'🇻🇳'}};
const rows={
downloadClip:['下载视频','Download clip','영상 다운로드','動画を保存','Tải video'],
brainLive:['果蝇大脑直播','LIVE FLY BRAINS','초파리 뇌 라이브','ハエの脳ライブ','NÃO RUỒI GIẤM TRỰC TIẾP'],
wholeBrain:['全脑形态','Whole brain','전체 뇌','全脳の形態','Toàn bộ não'],
selectedCircuit:['放大回路','Circuit close-up','회로 확대','回路を拡大','Phóng to mạch'],
anatomyNote:['真实中央脑、双侧视叶与神经元分枝；背景仅展示解剖结构。拖动旋转，滚动缩放。','Real central brain, both optic lobes and neuron branches. Background anatomy is not simulated. Drag to rotate; scroll to zoom.','실제 중앙뇌, 양쪽 시엽과 뉴런 가지입니다. 배경은 해부 구조만 표시합니다. 드래그로 회전, 스크롤로 확대하세요.','実際の中央脳、両側の視葉とニューロンの分枝。背景は解剖構造のみです。ドラッグで回転、スクロールで拡大。','Não trung tâm, hai thùy thị giác và nhánh nơron thật. Nền chỉ thể hiện giải phẫu. Kéo để xoay, cuộn để thu phóng.'],
brainSubtitle:['每一束闪光，来自实际模拟记录。','Every flash comes from a recorded simulated spike.','모든 섬광은 실제 시뮬레이션 기록입니다.','すべての点滅は実際のシミュレーション記録。','Mỗi tia sáng đến từ xung mô phỏng đã ghi lại.'],
followPlayer:['跟随出牌者','Follow the player','플레이어 따라가기','プレイヤーに追従','Theo người ra bài'],
spikeReplay:['160 ms 决策记录 · 20× 慢放循环','160 ms decision trace · 20× slower loop','160 ms 결정 기록 · 20배 느린 반복','160 msの判断記録 · 20倍スロー再生','Bản ghi quyết định 160 ms · Lặp chậm 20×'],
selectNeuron:['点击神经元查看状态','Select a neuron to inspect','뉴런을 선택해 확인','ニューロンを選んで確認','Chọn nơron để xem'],
neuronId:['神经元编号','Neuron ID','뉴런 ID','ニューロンID','ID nơron'],
findNeuron:['定位','Find','찾기','検索','Tìm'],
spikeCount:['放电次数','Spike count','발화 횟수','発火回数','Số lần phát xung'],
rate:['平均放电率','Mean firing rate','평균 발화율','平均発火率','Tần số phát xung TB'],
voltage:['末端膜电位','Final membrane state','최종 막전위 상태','最終膜電位状態','Trạng thái màng cuối'],
inhibition:['连续抑制量','Inhibitory activity','연속 억제량','連続抑制量','Hoạt tính ức chế'],
modelUnits:['无量纲模型值','Dimensionless model units','무차원 모델 값','無次元のモデル値','Giá trị mô hình không thứ nguyên'],
noVoltage:['该细胞不模拟膜电位','No membrane voltage modeled','막전위 모델 없음','膜電位はモデル化していません','Không mô phỏng điện thế màng'],
anatomyOnly:['仅解剖位置，未模拟活动','Anatomy only; activity not simulated','해부학적 위치만, 활동 미모델링','解剖学的位置のみ・活動は非モデル化','Chỉ giải phẫu; không mô phỏng hoạt động'],
waitingNeural:['等待这只果蝇的首次决策','Waiting for this fly’s first decision','이 초파리의 첫 결정 대기','このハエの最初の判断待ち','Chờ quyết định đầu tiên của chú ruồi này'],
latestDecision:['最近决策','Latest decision','최근 결정','直近の判断','Quyết định mới nhất'],
neuralAccuracy:['显示 984 个模拟神经元的实际状态；17 个 DAN 仅保留解剖信息。APL 为连续抑制量，不模拟放电。','Actual states of 984 simulated neurons; 17 DANs are anatomy only. APL is continuous inhibition, not spiking.','모델 뉴런 984개의 실제 상태. DAN 17개는 해부 정보만 표시. APL은 발화 대신 연속 억제량입니다.','モデル化された984ニューロンの実際の状態。17 DANは解剖情報のみ。APLは発火でなく連続抑制量です。','Trạng thái thực của 984 nơron mô phỏng; 17 DAN chỉ có giải phẫu. APL là ức chế liên tục, không phát xung.'],
resetView:['重置视角','Reset view','시점 초기화','視点を戻す','Đặt lại góc nhìn'],
spikesNow:['当前放电','Spiking now','현재 발화','再生中の発火','Đang phát xung'],
neuronMissing:['未找到有位置记录的神经元','No neuron with recorded position found','위치 기록이 있는 뉴런을 찾지 못함','位置記録のあるニューロンが見つかりません','Không tìm thấy nơron có vị trí ghi nhận'],

paused:['计算暂停 · 保留已确认结果','Paused · last confirmed result retained','계산 일시 중지 · 확인된 결과 유지','計算を停止 · 確認済みの結果を保持','Tạm dừng · giữ kết quả đã xác nhận'],
moves:['手出牌','moves','번 플레이','手','lượt đánh'],
pastChampions:['历届冠军','PAST CHAMPIONS','역대 챔피언','歴代の優勝者','CÁC NHÀ VÔ ĐỊCH'],
firstSeason:['首个赛季正在进行','The first season is underway','첫 시즌 진행 중','最初のシーズンを開催中','Mùa đầu tiên đang diễn ra'],
brand:['果蝇欢乐局','FLY CARD CLUB','초파리 카드 클럽','ハエのカードクラブ','CLB BÀI RUỒI GIẤM'],
tagline:['五只果蝇，一桌好戏。','Five flies. A table full of trouble.','초파리 다섯, 한 판의 승부.','5匹のハエ、波乱の一卓。','Năm chú ruồi. Một bàn đầy bất ngờ.'],
live:['全球同桌 · 实时对局','ONE GLOBAL TABLE · LIVE','전 세계 한 테이블 · 실시간','世界でひとつの卓 · ライブ','MỘT BÀN TOÀN CẦU · TRỰC TIẾP'],
connecting:['正在连接牌桌','Connecting to the table','테이블 연결 중','テーブルに接続中','Đang kết nối bàn'],
reconnecting:['正在重连 · 保留上一画面','Reconnecting · last confirmed state','재연결 중 · 마지막 확인 상태','再接続中 · 最終確認状態','Đang kết nối lại · trạng thái đã xác nhận'],
rules:['一分钟看懂','Learn in a minute','1분 규칙 안내','1分でわかるルール','Hiểu luật trong một phút'],
standings:['赛季榜','Standings','순위','ランキング','Bảng xếp hạng'],
method:['果蝇怎么思考','How the circuits play','신경 회로의 선택','神経回路の選択','Mạch thần kinh chọn thế nào'],
source:['开源代码 ↗','Source ↗','소스 코드 ↗','ソースコード ↗','Mã nguồn ↗'],
season:['赛季','SEASON','시즌','シーズン','MÙA'],
round:['轮','ROUND','라운드','ラウンド','VÒNG'],
hand:['局','HAND','판','局','VÁN'],
beans:['欢乐豆','Beans','콩','ビーンズ','Đậu'],
debt:['负债','Debt','부채','負債','Nợ'],
net:['净资产','Net assets','순자산','純資産','Tài sản ròng'],
score:['积分','Points','점수','ポイント','Điểm'],
winrate:['胜率','Win rate','승률','勝率','Tỷ lệ thắng'],
landlord:['明地主','Landlord','지주','地主','Địa chủ'],
partner:['暗地主','Hidden ally','숨은 동료','隠れた仲間','Đồng minh ẩn'],
farmer:['农民','Farmer','농민','農民','Nông dân'],
unknown:['身份待揭晓','Identity unrevealed','정체 미공개','正体未公開','Chưa lộ vai trò'],
waiting:['等待发牌','Waiting for cards','배분 대기','配札待ち','Chờ chia bài'],
deal:['洗牌发牌','SHUFFLE & DEAL','카드 배분','シャッフル＆配札','XÁO VÀ CHIA BÀI'],
bid:['叫地主','BID FOR LANDLORD','지주 입찰','地主を決める','GỌI ĐỊA CHỦ'],
play:['出牌中','CARDS IN PLAY','플레이 중','対局中','ĐANG ĐÁNH BÀI'],
settle:['本局结算','HAND COMPLETE','이번 판 정산','この局の精算','KẾT TOÁN VÁN'],
roundEnd:['本轮结算','ROUND COMPLETE','라운드 정산','ラウンド精算','KẾT TOÁN VÒNG'],
loanPositive:['借款到账 · 短暂奖励','LOAN ARRIVES · REWARD PULSE','대출 지급 · 보상 신호','借入完了 · 一時的な報酬','NHẬN KHOẢN VAY · TÍN HIỆU THƯỞNG'],
loanNegative:['债务压力 · 延迟惩罚','DEBT PRESSURE · DELAYED PENALTY','부채 압박 · 지연 페널티','債務の重圧 · 遅延ペナルティ','ÁP LỰC NỢ · PHẠT TRỄ'],
seasonEnd:['赛季冠军诞生','SEASON CHAMPION','시즌 챔피언','シーズン優勝','NHÀ VÔ ĐỊCH MÙA'],
pass:['不出','PASS','패스','パス','BỎ LƯỢT'],
turn:['正在思考','is thinking','생각 중','思考中','đang suy nghĩ'],
cards:['张','cards','장','枚','lá'],
bottom:['地主底牌','LANDLORD BONUS','지주 보너스 카드','地主の追加札','BÀI THƯỞNG ĐỊA CHỦ'],
identity:['暗地主身份牌','HIDDEN ALLY CARD','숨은 동료 카드','仲間の目印札','LÁ XÁC ĐỊNH ĐỒNG MINH'],
identityHint:['打出同花同点的另一张，身份揭晓。','Play its twin to reveal the hidden ally.','같은 카드의 짝을 내면 정체 공개.','同じ札のもう1枚を出すと正体判明。','Đánh lá song sinh để lộ đồng minh.'],
noBid:['不叫','NO BID','패스','見送り','KHÔNG GỌI'],
watchHands:['全知观战 · 查看手牌','OMNISCIENT VIEW · INSPECT HANDS','관전 시점 · 손패 보기','全知の観戦 · 手札を見る','GÓC NHÌN TOÀN TRI · XEM TAY BÀI'],
privacy:['你能看见所有手牌；果蝇只知道自己的牌与公开记录。','You can inspect every hand. Each fly sees only its own cards and public history.','관객은 모든 손패를 봅니다. 초파리는 자기 패와 공개 기록만 압니다.','観客は全手札を確認できます。ハエが知るのは自分の札と公開情報だけ。','Bạn xem được mọi tay bài. Mỗi chú ruồi chỉ biết bài của mình và lịch sử công khai.'],
activity:['牌桌动态','TABLE FEED','테이블 소식','卓の動き','DIỄN BIẾN BÀN'],
next:['下一步','Next event','다음 단계','次の動き','Bước tiếp theo'],
initial:['每只初始 10,000 豆','10,000 beans per fly to start','각 초파리 10,000콩 시작','各10,000ビーンズで開始','Mỗi chú ruồi bắt đầu với 10.000 đậu'],
format:['双副牌 · 五人同桌 · 明暗地主','Two decks · Five players · A hidden ally','카드 두 벌 · 5인 · 숨은 동료','2組のカード · 5人 · 隠れた仲間','Hai bộ bài · Năm người · Đồng minh ẩn'],
roundFormat:['3 轮决出冠军 · 每轮最多 5 局','3 rounds crown a champion · Up to 5 hands each','3라운드로 우승 결정 · 각 최대 5판','3ラウンドで優勝決定 · 各最大5局','3 vòng tìm nhà vô địch · Tối đa 5 ván mỗi vòng'],
feedback:['本次神经反馈','LATEST NEURAL FEEDBACK','최근 신경 피드백','最新の神経フィードバック','PHẢN HỒI THẦN KINH MỚI NHẤT'],
modeled:['奖赏样 / 惩罚样模拟信号','Modeled reward / penalty signals','모델 보상 / 페널티 신호','報酬・罰のモデル信号','Tín hiệu thưởng / phạt mô phỏng'],
loan:['借款','Loan','대출','借入','Khoản vay'],
loanTerms:['归零借 5,000 豆 · 每轮限一次 · 轮末本金利息 10%','At zero: borrow 5,000 · Once per round · 10% interest on principal at round end','0콩이면 5,000 대출 · 라운드당 1회 · 종료 시 원금의 10% 이자','残高0で5,000借入 · 各ラウンド1回 · 終了時に元本の10%利息','Hết đậu: vay 5.000 · Một lần mỗi vòng · Lãi 10% gốc cuối vòng'],
noMoney:['仅为虚拟实验积分，没有充值、提现或真实金钱。','Virtual experiment points only. No deposits, withdrawals or real money.','실험용 가상 점수입니다. 충전·출금·실제 돈은 없습니다.','実験用の仮想ポイントです。入出金や実際のお金は扱いません。','Chỉ là điểm thí nghiệm ảo. Không nạp, rút hay dùng tiền thật.'],
reset:['新赛季重发 10,000 豆，清算旧债；历史成绩与学习状态保留。','Each new season resets beans to 10,000 and closes old debt; records and learning persist.','새 시즌에 10,000콩 재지급·이전 부채 정리. 기록과 학습은 유지.','新シーズンは10,000に戻し旧債務を終了。記録と学習は継続。','Mùa mới cấp lại 10.000 đậu và khép lại nợ cũ; giữ thành tích và trạng thái học.'],
champion:['冠军','Champion','챔피언','優勝','Vô địch'],
leader:['本季领先','SEASON LEADER','시즌 선두','シーズン首位','DẪN ĐẦU MÙA'],
allTime:['累计胜局','Wins to date','누적 승리','通算勝利','Tổng ván thắng'],
roundPoints:['本季积分','Season points','시즌 점수','今季ポイント','Điểm mùa'],
netWon:['本季净赢豆','Season net winnings','시즌 순수익','今季の純獲得','Đậu thắng ròng trong mùa'],
creditExplain:['到账的奖励只是开始，债务成本随后到来。','The reward arrives first. The cost of debt follows.','보상이 먼저, 부채 비용은 나중에.','報酬が先に届き、債務の負担が後から来る。','Phần thưởng đến trước. Cái giá của nợ đến sau.'],
close:['关闭','Close','닫기','閉じる','Đóng'],
sound:['音效','Sound','효과음','効果音','Âm thanh'],
fullScreen:['沉浸看牌','Immersive view','몰입 보기','集中表示','Xem nhập vai'],
save:['录制 30 秒','Record 30 seconds','30초 녹화','30秒録画','Ghi 30 giây'],
recording:['正在录制…','Recording…','녹화 중…','録画中…','Đang ghi…'],
saved:['录像已下载','Clip downloaded','영상 다운로드 완료','動画をダウンロードしました','Đã tải video'],
recordUnavailable:['此浏览器暂不支持录制','Recording unavailable in this browser','이 브라우저는 녹화를 지원하지 않습니다','このブラウザでは録画できません','Trình duyệt này chưa hỗ trợ ghi'],
loading3d:['正在准备果蝇牌手…','Preparing the fly players…','초파리 플레이어 준비 중…','ハエのプレイヤーを準備中…','Đang chuẩn bị các chú ruồi…'],
archive:['最近完成的牌局','RECENT FINISHED HANDS','최근 완료된 판','直近の終了局','CÁC VÁN VỪA KẾT THÚC'],
replay:['复盘','Review','복기','振り返る','Xem lại'],
back:['返回直播','Back to live','라이브로 돌아가기','ライブへ戻る','Về trực tiếp'],
scientific:['选定连接组回路 · 工程化决策与反馈','Selected connectome circuits · Engineered decisions and feedback','선택된 커넥톰 회로 · 설계된 의사결정과 피드백','選択した神経回路 · 設計された意思決定とフィードバック','Mạch kết nối chọn lọc · Quyết định và phản hồi được thiết kế'],
empty:['第一局正在进行','The first hand is underway','첫 판 진행 중','最初の局を対戦中','Ván đầu tiên đang diễn ra'],
teamWin:['阵营获胜','TEAM WINS','팀 승리','陣営の勝利','PHE CHIẾN THẮNG'],
multiplier:['倍数','Multiplier','배수','倍率','Hệ số'],
base:['底分','Base','기본 점수','基本点','Điểm cơ bản'],
reveal:['暗地主现身！','THE HIDDEN ALLY REVEALS!','숨은 동료 등장!','隠れた仲間が判明！','ĐỒNG MINH ẨN LỘ DIỆN!'],
bomb:['炸弹！','BOMB!','폭탄!','爆弾！','BOM!'],
rocket:['王炸！','ROCKET!','로켓!','ロケット！','TỨ QUÝ JOKER!'],
straight:['顺子','STRAIGHT','스트레이트','ストレート','SẢNH'],
pairRun:['连对','PAIR RUN','연속 페어','連続ペア','ĐÔI LIÊN TIẾP'],
tripleRun:['飞机','AIRPLANE','트리플 연속','連続トリプル','BA LIÊN TIẾP'],
single:['单张','SINGLE','한 장','シングル','LẺ'],
pair:['对子','PAIR','페어','ペア','ĐÔI'],
triple:['三张','TRIPLE','트리플','トリプル','BỘ BA'],
tripleSingle:['三带一','TRIPLE + SINGLE','트리플 + 한 장','トリプル＋1枚','BA KÈM MỘT'],
triplePair:['三带二','TRIPLE + PAIR','트리플 + 페어','トリプル＋ペア','BA KÈM ĐÔI'],
airplaneSingle:['飞机带单','AIRPLANE + SINGLES','트리플 연속 + 싱글','連続トリプル＋単札','BA LIÊN KÈM LẺ'],
airplanePair:['飞机带对','AIRPLANE + PAIRS','트리플 연속 + 페어','連続トリプル＋ペア','BA LIÊN KÈM ĐÔI'],
fourSingles:['四带二','FOUR + TWO','네 장 + 두 장','4枚＋2枚','BỐN KÈM HAI'],
fourPairs:['四带两对','FOUR + TWO PAIRS','네 장 + 두 페어','4枚＋2ペア','BỐN KÈM HAI ĐÔI'],
};
let current='en', manualSelection=0, initialization=0;const index={zh:0,en:1,ko:2,ja:3,vi:4};
export const t=(key)=>rows[key]?.[index[current]]??key;
export const locale=()=>current;
export const n=value=>Number(value||0).toLocaleString({zh:'zh-CN',en:'en-US',ko:'ko-KR',ja:'ja-JP',vi:'vi-VN'}[current]);
export function setLanguage(code,remember=true){
  if(!languages[code])return;
  if(remember)manualSelection++;
  current=code;
  document.documentElement.lang=code==='zh'?'zh-CN':code;
  if(remember)try{localStorage.setItem('fly-arena-language',code);}catch{}
  window.dispatchEvent(new CustomEvent('languagechange',{detail:code}));
}
export async function initLanguage(){
  const request=++initialization, selection=manualSelection;
  // A manual choice wins even when storage is blocked or an older request is pending.
  if(selection)return;
  let saved;try{saved=localStorage.getItem('fly-arena-language');}catch{}
  if(languages[saved]){setLanguage(saved,false);return;}
  const lang=(navigator.language||'en').slice(0,2).toLowerCase();
  setLanguage(languages[lang]?lang:'en',false);
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),3500);
  try{
    const response=await fetch('/api/locale',{signal:controller.signal});
    if(!response.ok)return;
    const data=await response.json();
    if(request===initialization&&selection===manualSelection&&languages[data.language])setLanguage(data.language,false);
  }catch{}finally{clearTimeout(timeout);}
}
