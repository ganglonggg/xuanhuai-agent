const { fail, str } = require('./storage');
const schema = properties => ({type:'object',properties,additionalProperties:false});
const text = description => ({type:'string',description});
function createTools(publicService,personalService,cooperation,accounts) {
  const cooperationPayload={
    id:text('修改或操作的记录 ID'),needId:text('表达意向的需求 ID'),title:text('需求标题'),summary:text('可公开简介，不得含未经授权的技术细节'),
    lookingFor:text('希望找到的人或讨论的问题'),offering:text('能提供什么；导师可约时间写在这里'),expectations:text('投入与合作预期'),
    kind:{type:'string',enum:['project','availability']},audience:{type:'string',enum:['members','selected']},memberIds:{type:'array',items:{type:'string'}},
    who:text('本人身份介绍'),experience:text('本人已有经历，不编造'),availability:text('本人能投入多少'),decision:{type:'string',enum:['accepted','declined']},
    skills:text('本人授权核对的技能标签，逗号分隔'),hours:{type:'number',exclusiveMinimum:0,maximum:168},mode:{type:'string',enum:['online','onsite','flexible']},contact:text('本人批准交换的联系方式'),time:text('北京时间 YYYY-MM-DDTHH:mm'),duration:{type:'integer',minimum:10,maximum:240},place:text('约见地点或线上方式'),agenda:text('约见议题')
  };
  const definitions=[
    {name:'get_cooperation_updates',description:'查询当前身份的合作进度通知，只含状态摘要，不含联系方式、未确认草稿或私人理由。可传 after 游标增量获取。',inputSchema:schema({after:{type:'integer',minimum:0}}),authenticated:true},
    {name:'mark_cooperation_read',description:'本人已查看通知后，按读到的 through 游标标记已读；不会确认意向、许可或约见。',inputSchema:{...schema({through:{type:'integer',minimum:0}}),required:['through']},authenticated:true,write:true},
    {name:'get_cooperation_board',description:'查询当前身份可见的需求、本人参与的意向和约见进度。没有对方许可时不返回对方联系方式。',inputSchema:schema({}),authenticated:true},
    {name:'prepare_cooperation',description:'准备需求发布、意向、许可或约见的待确认卡片。只存草稿，不执行；必须展示全部内容与可见范围，由本人确认。',inputSchema:{...schema({operation:{type:'string',enum:['authorize_preflight','revoke_preflight','publish_need','close_need','send_interest','withdraw_interest','decide_interest','consent_contact','revoke_consent','propose_meeting','confirm_meeting','cancel_meeting']},payload:{...schema(cooperationPayload)}}),required:['operation','payload']},authenticated:true,write:true},
    {name:'confirm_cooperation',description:'仅在本人看过完整待确认卡片并明确确认后执行。不能把准备草稿等同于已经发布或交换。',inputSchema:{...schema({draftId:text('本人已确认的草稿 ID')}),required:['draftId']},authenticated:true,write:true},
    {name:'discard_cooperation',description:'本人取消尚未确认的合作操作。',inputSchema:{...schema({draftId:text('草稿 ID')}),required:['draftId']},authenticated:true,write:true},
    {name:'get_recommendations',description:'按本人已确认的偏好筛选一周课程。没有当期确认安排就返回空，不拿历史样例替代。',inputSchema:schema({start:text('周起始日期 YYYY-MM-DD，省略时取下周')}),personal:true},
    {name:'get_my_memory',description:'查看自己的已确认偏好、有效期和推荐反馈。',inputSchema:schema({}),personal:true},
    {name:'register_gap',description:'登记课程事实缺口；未查到课程可只传 title，进入管理员待分配队列。依真实状态说明进度。',inputSchema:schema({id:text('场次或课程 ID，可省略'),title:text('没有 ID 时提供课程名'),start:text('问题所属周一日期'),field:{type:'string',enum:['place','time','teacher','is_running','registration','topic','guest','campus']}}),personal:true,write:true},
    {name:'get_gap_results',description:'查询本人登记的事实缺口及真实进度：待转交、本机老师已取到、答复待确认、已确认。只有已确认时返回答案。',inputSchema:schema({}),personal:true},
    {name:'list_pending_questions',description:'教师 agent 领取分配给自己的事实问题，并记录本机领取时间。不含学生身份和原话，不代表已发邮件。',inputSchema:schema({}),teacher:true,write:true},
    {name:'answer_question',description:'提交具体答复，生成变更提案。必须展示差异，老师确认后才会入库和通知。',inputSchema:{...schema({gapId:text('待答问题 ID'),answer:text('明确答复；is_running 用 yes 或 no')}),required:['gapId','answer']},teacher:true,write:true},
    {name:'search_knowledge',description:'检索宣怀公众号历史文章，返回相关段落、发布日期和原文链接。文章中的情况未必仍然有效。',inputSchema:{...schema({query:text('简短关键词；可多次换词查询')}),required:['query']}},
    {name:'get_article_card',description:'获取一篇归档文章的卡片和原文链接。',inputSchema:{...schema({id:text('文章 ID')}),required:['id']}},
    {name:'list_courses',description:'查询公共课表。默认本周与下周（Asia/Shanghai）；沿用项并非本周已核对事实，未知项留空。',inputSchema:schema({query:text('课程名、地点或主讲人关键词'),start:text('指定周一 YYYY-MM-DD，可查询往期')})},
    {name:'get_course',description:'按 ID 查询一条课程及其来源、核对状态。',inputSchema:{...schema({id:text('课程 ID')}),required:['id']}},
    {name:'get_changes',description:'查询指定游标之后的课程变更。',inputSchema:schema({after:{type:'integer',minimum:0}})},
    {name:'follow_course',description:'在用户明确要求后关注一条课程，获得之后的站内变更通知。需要个人访问令牌。',inputSchema:{...schema({id:text('课程 ID')}),required:['id']},personal:true,write:true},
    {name:'unfollow_course',description:'在用户明确要求后取消关注课程。需要个人访问令牌。',inputSchema:{...schema({id:text('课程 ID')}),required:['id']},personal:true,write:true},
    {name:'get_my_updates',description:'获取自己的课程订阅和变更通知，不返回个人偏好。需要个人访问令牌。',inputSchema:schema({}),personal:true},
    {name:'propose_course_change',description:'教师提交课程修改草稿。只创建提案，不发布；向老师展示前后差异，再由老师确认。',inputSchema:{...schema({id:text('课程 ID'),fields:{type:'object',properties:Object.fromEntries(['title','date','time','place','campus','teacher','organizer','topic','guest','registration','is_running','note','status','visibility'].map(k=>[k,text(k)])),additionalProperties:false}}),required:['id','fields']},teacher:true,write:true},
    {name:'confirm_course_change',description:'仅在老师看过提案差异并明确确认后调用。发布提案并产生变更通知；旧提案会拒绝覆盖新数据。',inputSchema:{...schema({proposalId:text('已向老师展示并确认的提案 ID')}),required:['proposalId']},teacher:true,write:true}
  ];
  const ruleSchema={type:'object',properties:{startWeek:{type:['integer','null']},endWeek:{type:['integer','null']},frequency:{type:'string',enum:['weekly','odd','even','unknown']},days:{type:'array',items:{type:'integer',minimum:1,maximum:7}},slots:{type:'array',items:{type:'object',properties:{day:{type:'integer'},time:text('时段')},required:['day','time'],additionalProperties:false}},basis:{type:'array',items:{type:'string'}},inferred:{type:'boolean'},text:text('原规则描述')},required:['frequency','days','slots','basis','inferred'],additionalProperties:false};
  const fieldsSchema=definitions.find(d=>d.name==='propose_course_change').inputSchema.properties.fields;
  const extra=[
    ['get_week_summary','查询本周与下周汇总，含来源、逐项核对状态和时间冲突。',{},false,false],
    ['get_course_catalog','教师查看课程目录、负责关系与周次规则。',{},true,false],
    ['get_week_draft','取某周草稿；仅负责老师和管理员可编辑。',{start:text('周一日期')},true,false],
    ['save_week_draft','暂存本人场次的填写及已核对字段；不会发布。',{start:text('周一日期'),id:text('场次 ID'),fields:fieldsSchema,confirmedFields:{type:'array',items:{type:'string'}}},true,true],
    ['prepare_week_publish','生成本人场次的发布提案，展示 review、unresolved 和可见范围。老师明确确认后才用 confirm_course_change。',{start:text('周一日期')},true,true],
    ['generate_week_draft','管理员按课程周次规则生成指定周草稿。重复生成不会覆盖已有周。',{start:text('周一日期')},true,true],
    ['configure_semester','管理员配置学期周次锚点。',{start:text('锚点周一日期'),number:{type:'integer'}},true,true],
    ['propose_schedule_operation','新增课程/场次、取消场次、结课或修正规则，只生成提案。确认后才生效。',{operation:{type:'string',enum:['add_course','add_session','cancel_session','end_course','update_rule']},payload:{type:'object',properties:{id:text('场次 ID'),courseId:text('稳定课程 ID'),title:text('新课程名'),date:text('场次日期'),time:text('时段'),place:text('地点'),campus:text('校区'),teacher:text('主讲人'),visibility:{type:'string',enum:['members','staff']},rule:ruleSchema},additionalProperties:false}},true,true],
    ['suggest_course_correction','对别人负责的场次提交更正建议，负责老师审核确认后才生效。',{id:text('场次 ID'),fields:fieldsSchema},true,true],
    ['list_correction_suggestions','只取本人负责课程的更正建议；无负责人由管理员处理。',{},true,false],
    ['prepare_correction','把更正建议整理为提案；仍须老师确认。',{suggestionId:text('建议 ID')},true,true],
    ['list_teacher_accounts','管理员查看本地教师账号，不返回密码哈希。',{},true,false],
    ['create_teacher_account','管理员创建本地教师账号；不发邮件。',{username:text('用户名'),name:text('姓名'),password:text('至少 8 位口令')},true,true],
    ['reset_teacher_password','管理员重置教师口令并撤销既有教师令牌。',{teacherId:text('教师账号 ID'),password:text('至少 8 位口令')},true,true],
    ['assign_course_owner','管理员指定课程负责账号；teacherId 为空表示待分配。',{courseId:text('课程 ID'),teacherId:text('教师 ID 或空字符串')},true,true],
    ['assign_question','管理员把没有课程 ID 的问题分配给教师。',{gapId:text('问题 ID'),teacherId:text('教师 ID')},true,true]
  ];
  for(const [name,description,properties,teacher,write] of extra)definitions.push({name,description,inputSchema:{...schema(properties),required:Object.keys(properties)},teacher,write});
  function list(actor){return definitions.filter(d=>(!d.teacher||actor?.role==='teacher')&&(!d.authenticated||actor)).map(({personal,teacher,write,authenticated,...d})=>({...d,annotations:{readOnlyHint:!write,destructiveHint:false,idempotentHint:!['propose_course_change','prepare_cooperation','answer_question'].includes(d.name),openWorldHint:false}}));}
  function execute(name,args={},actor){
    const def=definitions.find(d=>d.name===name);if(!def)fail('未知工具',404);
    if(!args||typeof args!=='object'||Array.isArray(args))fail('工具参数必须为对象');
    for(const k of def.inputSchema.required||[])if(args[k]===undefined)fail(`缺少参数 ${k}`);
    if(def.authenticated&&!actor)fail('请先登录',401);
    if(def.teacher&&actor?.role!=='teacher')fail('需要教师权限',403);
    if(def.personal&&actor?.role!=='student')fail('需要个人访问令牌',401);
    if(def.inputSchema.required?.includes('id'))str(args.id,'ID',100);
    switch(name){
      case 'get_week_summary':return publicService.summary(actor);
      case 'get_course_catalog':return publicService.catalog(actor);
      case 'get_week_draft':return publicService.getDraft(args.start,actor);
      case 'save_week_draft':return publicService.editDraft(args.start,args.id,args.fields,args.confirmedFields,actor);
      case 'prepare_week_publish':return publicService.prepareWeek(args.start,actor);
      case 'generate_week_draft':return publicService.generateWeek(args.start,actor);
      case 'configure_semester':return publicService.configureAnchor(args,actor);
      case 'propose_schedule_operation':return publicService.proposeOperation(args.operation,args.payload,actor);
      case 'suggest_course_correction':return publicService.suggest(args.id,args.fields,actor);
      case 'list_correction_suggestions':return publicService.suggestions(actor);
      case 'prepare_correction':return publicService.acceptSuggestion(args.suggestionId,actor);
      case 'list_teacher_accounts':return accounts.list(actor);
      case 'create_teacher_account':return accounts.create(actor,args);
      case 'reset_teacher_password':return accounts.reset(actor,args.teacherId,args.password);
      case 'assign_course_owner':return accounts.assign(actor,args.courseId,args.teacherId);
      case 'assign_question':{if(!accounts.list(actor).some(t=>t.id===args.teacherId))fail('教师账号不存在',404);return publicService.assignQuestion(args.gapId,args.teacherId,actor);}

      case 'get_cooperation_updates':return cooperation.updates(actor,args.after??0);
      case 'mark_cooperation_read':return cooperation.markRead(actor,args.through);
      case 'get_cooperation_board':return cooperation.board(actor);
      case 'prepare_cooperation':return cooperation.prepare(actor,args.operation,args.payload);
      case 'confirm_cooperation':return cooperation.confirm(actor,args.draftId);
      case 'discard_cooperation':return cooperation.discard(actor,args.draftId);
      case 'get_recommendations':return personalService.learning.recommend(actor,{start:args.start});
      case 'get_my_memory':{const s=personalService.learning.state(actor);return {memories:s.memories,feedback:s.feedback};}
      case 'register_gap':return personalService.learning.registerGap(actor,args);
      case 'get_gap_results':return personalService.learning.results(actor);
      case 'list_pending_questions':return publicService.receiveQuestions(actor);
      case 'answer_question':return publicService.answerGap(args.gapId,args.answer,actor);
      case 'search_knowledge':return publicService.knowledge.search(args.query);
      case 'get_article_card':return publicService.knowledge.getCard(args.id);
      case 'list_courses':return publicService.listCourses(args.query,actor,{start:args.start});
      case 'get_course':return publicService.getCourse(args.id,actor);
      case 'get_changes':return publicService.changes(args.after??0,actor);
      case 'follow_course':return personalService.follow(actor,args.id);
      case 'unfollow_course':return personalService.unfollow(actor,args.id);
      case 'get_my_updates':{const s=personalService.state(actor);return {subscriptions:s.subscriptions,notifications:s.notifications,unread:s.unread};}
      case 'propose_course_change':return publicService.propose([{id:args.id,fields:args.fields}],actor);
      case 'confirm_course_change':return publicService.confirm(str(args.proposalId,'提案 ID',100),actor);
    }
  }
  return {list,execute};
}
module.exports={createTools};
