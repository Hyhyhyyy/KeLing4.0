import { create } from 'zustand';
import { authErrorMessage, validAuthResponse } from '../services/authError';
import { persist } from 'zustand/middleware';
import type { User, Course, Task, Note } from '../types';
import { authAPI, courseAPI, taskAPI, noteAPI } from '../services/api';
import { startGuestSession, endGuestSession, getGuestSessionId } from '../services/guestSession';
import { clearModelAccess } from '../services/modelAccess';
import { readExpeditionIdentity, rememberExpeditionIdentity } from '../services/expeditionStorage';

const dataRequests = { courses: 0, tasks: 0, notes: 0 };
const emptyDataErrors = () => ({ courses: '', tasks: '', notes: '', profile: '' });

const workspaceIdentity = () => getGuestSessionId() || `account:${localStorage.getItem('token') || ''}`;

interface AppState {
  // 用户状态
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isLoading: boolean;
  authError: string | null;
  offlineAccount: boolean;
  dataErrors: ReturnType<typeof emptyDataErrors>;

  // 数据状态
  courses: Course[];
  tasks: Task[];
  notes: Note[];

  // UI 状态
  currentScreen: string;

  // Actions
  login: (email: string, password: string, signal?: AbortSignal) => Promise<void>;
  register: (name: string, email: string, password: string, signal?: AbortSignal) => Promise<void>;
  logout: () => void;
  startGuest: () => Promise<void>;
  endGuest: () => void;
  loadUser: () => Promise<void>;

  // 数据操作
  loadCourses: () => Promise<void>;
  loadTasks: () => Promise<void>;
  loadNotes: () => Promise<void>;

  // 课程操作
  createCourse: (data: any) => Promise<void>;
  updateCourse: (id: string, data: any) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;

  // 任务操作
  createTask: (data: any) => Promise<void>;
  updateTask: (id: string, data: any) => Promise<void>;
  completeTask: (id: string, actualMinutes?: number) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  // 笔记操作
  createNote: (data: any) => Promise<void>;

  // 导航
  navigateTo: (screen: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 初始状态
      user: null,
      token: null,
      isAuthenticated: false,
      isGuest: false,
      isLoading: false, // 改为 false，避免初始加载卡住
      courses: [],
      tasks: [],
      notes: [],
      currentScreen: 'home',
      authError: null,
      offlineAccount: false,
      dataErrors: emptyDataErrors(),

      // 登录
      login: async (email, password, signal) => {
        try {
          const { data } = await authAPI.login({ email: email.trim().toLowerCase(), password }, signal);
          if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'AUTH_CANCELLED' });
          if (!validAuthResponse(data)) throw new Error('INVALID_AUTH_RESPONSE');
          endGuestSession();
          clearModelAccess();
          localStorage.setItem('token', data.token);
          void rememberExpeditionIdentity(data.user, data.token).catch(() => {});
          set({
            authError: null,
            courses: [], tasks: [], notes: [],
            token: data.token,
            user: data.user,
            isAuthenticated: true,
            offlineAccount: false,
            dataErrors: emptyDataErrors(),
            isGuest: false,
            isLoading: false,
          });
        } catch (error: any) {
          throw new Error(authErrorMessage(error, '未能完成登录，请检查服务连接后重试'));
        }
      },

      // 注册
      register: async (name, email, password, signal) => {
        try {
          const { data } = await authAPI.register({ name: name.trim(), email: email.trim().toLowerCase(), password }, signal);
          if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'AUTH_CANCELLED' });
          if (!validAuthResponse(data)) throw new Error('INVALID_AUTH_RESPONSE');
          endGuestSession();
          clearModelAccess();
          localStorage.setItem('token', data.token);
          void rememberExpeditionIdentity(data.user, data.token).catch(() => {});
          set({
            authError: null,
            courses: [], tasks: [], notes: [],
            token: data.token,
            user: data.user,
            isAuthenticated: true,
            offlineAccount: false,
            dataErrors: emptyDataErrors(),
            isGuest: false,
            isLoading: false,
          });
        } catch (error: any) {
          throw new Error(authErrorMessage(error, '未能确认注册结果，请尝试登录或稍后重试'));
        }
      },

      // 登出
      logout: () => {
        if (get().isGuest) { get().endGuest(); return; }
        localStorage.removeItem('token');
        clearModelAccess();
        set({
          authError: null,
          isLoading: false,
          user: null,
          token: null,
          isAuthenticated: false,
          offlineAccount: false,
          dataErrors: emptyDataErrors(),
          isGuest: false,
          courses: [],
          tasks: [],
          notes: [],
        });
      },

      startGuest: async () => {
        if (getGuestSessionId()) return;
        startGuestSession();
        clearModelAccess();
        set({ isGuest: true, isAuthenticated: false, offlineAccount: false, user: null, authError: null,
          courses: [], tasks: [], notes: [], dataErrors: emptyDataErrors(), isLoading: true });
        await get().loadUser();
      },
      endGuest: () => {
        endGuestSession();
        clearModelAccess();
        // The visitor never replaces or removes an existing account credential.
        set({ isGuest: false, isAuthenticated: false, offlineAccount: false, user: null, authError: null,
          token: localStorage.getItem('token'), courses: [], tasks: [], notes: [], dataErrors: emptyDataErrors(), isLoading: false });
      },

      // 加载用户数据
      loadUser: async () => {
        const session = workspaceIdentity();
        if (get().isGuest) {
          try {
            const { data } = await authAPI.getMe();
            if (workspaceIdentity() !== session) return;
            set({ user: data.user, isLoading: false, authError: null });
            await Promise.all([get().loadCourses(), get().loadTasks(), get().loadNotes()]);
          } catch {
            if (workspaceIdentity() === session) set({ isLoading: false, authError: '本次试用未能载入，请退出后重新进入。' });
          }
          return;
        }
        const token = localStorage.getItem('token');
        if (!token) { get().logout(); return; }
        set({isLoading:true,authError:null});
        try {
          const {data}=await authAPI.getMe();
          if(workspaceIdentity()!==session)return;
          set(state => ({user:data.user,token,isAuthenticated:true,isLoading:false,offlineAccount:false,dataErrors:{...state.dataErrors,profile:''}}));
          void rememberExpeditionIdentity(data.user,token).catch(() => {});
          void get().loadCourses();void get().loadTasks();void get().loadNotes();
        } catch(error) {
          if(workspaceIdentity()!==session)return;
          const status=(error as {response?:{status?:number}}).response?.status;
          if(status===401)get().logout();
          else {
            // A matching server-verified local identity permits cached work only.
            // It cannot authorize server operations or revive a different account.
            const cached = !status ? await readExpeditionIdentity(token).catch(() => null) : null;
            if(workspaceIdentity()!==session)return;
            if(cached)set({user:cached,token,isAuthenticated:true,isLoading:false,authError:null,offlineAccount:true});
            else set({isLoading:false,authError:'暂时无法连接服务，登录凭证已保留。请检查网络后重试。'});
          }
        }
      },

      // 加载课程
      loadCourses: async () => {
        const session = workspaceIdentity(), request = ++dataRequests.courses;
        try {
          const { data } = await courseAPI.getAll();
          if (session === workspaceIdentity() && request === dataRequests.courses) set(state => ({ courses: data.courses || [], dataErrors: { ...state.dataErrors, courses: '' } }));
        } catch {
          if (session === workspaceIdentity() && request === dataRequests.courses) set(state => ({ dataErrors: { ...state.dataErrors, courses: '课程未能刷新' } }));
        }
      },

      // 加载任务
      loadTasks: async () => {
        const session = workspaceIdentity(), request = ++dataRequests.tasks;
        try {
          const { data } = await taskAPI.getAll();
          if (session === workspaceIdentity() && request === dataRequests.tasks) set(state => ({ tasks: data.tasks || [], dataErrors: { ...state.dataErrors, tasks: '' } }));
        } catch {
          if (session === workspaceIdentity() && request === dataRequests.tasks) set(state => ({ dataErrors: { ...state.dataErrors, tasks: '任务未能刷新' } }));
        }
      },

      // 加载笔记
      loadNotes: async () => {
        const session = workspaceIdentity(), request = ++dataRequests.notes;
        try {
          const { data } = await noteAPI.getAll();
          if (session === workspaceIdentity() && request === dataRequests.notes) set(state => ({ notes: data.notes || [], dataErrors: { ...state.dataErrors, notes: '' } }));
        } catch {
          if (session === workspaceIdentity() && request === dataRequests.notes) set(state => ({ dataErrors: { ...state.dataErrors, notes: '笔记未能刷新' } }));
        }
      },

      // 创建课程
      createCourse: async (data) => {
        const session = workspaceIdentity();
        try {
          const response = await courseAPI.create(data);
          if (session !== workspaceIdentity()) return;
          dataRequests.courses++;
          if (response.data.course) set(state => ({ courses: [response.data.course, ...state.courses.filter(item => item.id !== response.data.course.id)] }));
          await get().loadCourses();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '创建课程失败');
        }
      },

      // 更新课程
      updateCourse: async (id, data) => {
        const session = workspaceIdentity();
        try {
          const response = await courseAPI.update(id, data);
          if (session !== workspaceIdentity()) return;
          dataRequests.courses++;
          if (response.data.course) set(state => ({ courses: state.courses.map(item => item.id === id ? response.data.course : item) }));
          await get().loadCourses();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '更新课程失败');
        }
      },

      // 删除课程
      deleteCourse: async (id) => {
        const session = workspaceIdentity();
        try {
          await courseAPI.delete(id);
          if (session !== workspaceIdentity()) return;
          dataRequests.courses++;
          set(state => ({ courses: state.courses.filter(item => item.id !== id) }));
          await get().loadCourses();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '删除课程失败');
        }
      },

      // 创建任务
      createTask: async (data) => {
        const session = workspaceIdentity();
        try {
          const response = await taskAPI.create(data);
          if (session !== workspaceIdentity()) return;
          dataRequests.tasks++;
          if (response.data.task) set(state => ({ tasks: [response.data.task, ...state.tasks.filter(item => item.id !== response.data.task.id)] }));
          await get().loadTasks();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '创建任务失败');
        }
      },

      // 更新任务
      updateTask: async (id, data) => {
        const session = workspaceIdentity();
        try {
          const response = await taskAPI.update(id, data);
          if (session !== workspaceIdentity()) return;
          dataRequests.tasks++;
          if (response.data.task) set(state => ({ tasks: state.tasks.map(item => item.id === id ? response.data.task : item) }));
          await get().loadTasks();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '更新任务失败');
        }
      },

      // 完成任务
      completeTask: async (id, actualMinutes) => {
        const session = workspaceIdentity();
        try {
          const { data } = await taskAPI.complete(id, { actualMinutes });
          if (workspaceIdentity() !== session) return;
          dataRequests.tasks++;
          if (data.task) set(state => ({ tasks: state.tasks.map(task => task.id === id ? data.task : task) }));
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '完成任务失败');
        }
        // Completion was accepted. A profile refresh failure must not report the
        // accepted write as failed or encourage another submission.
        try {
          const profile = await authAPI.getMe();
          if (workspaceIdentity() !== session) return;
          set(state => ({ user: profile.data.user, dataErrors: { ...state.dataErrors, profile: '' } }));
        } catch {
          if (workspaceIdentity() === session) set(state => ({ dataErrors: { ...state.dataErrors, profile: '任务已完成，个人统计待刷新' } }));
        }
        if (workspaceIdentity() === session) await get().loadTasks();
      },

      // 删除任务
      deleteTask: async (id) => {
        const session = workspaceIdentity();
        try {
          await taskAPI.delete(id);
          if (session !== workspaceIdentity()) return;
          dataRequests.tasks++;
          set(state => ({ tasks: state.tasks.filter(item => item.id !== id) }));
          await get().loadTasks();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '删除任务失败');
        }
      },

      // 创建笔记
      createNote: async (data) => {
        const session = workspaceIdentity();
        try {
          const response = await noteAPI.create(data);
          if (session !== workspaceIdentity()) return;
          dataRequests.notes++;
          if (response.data.note) set(state => ({ notes: [response.data.note, ...state.notes.filter(item => item.id !== response.data.note.id)] }));
          await get().loadNotes();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '创建笔记失败');
        }
      },

      // 导航
      navigateTo: (screen) => {
        set({ currentScreen: screen });
      },
    }),
    {
      name: 'keling-storage',
      partialize: (state) => ({
        token: state.token,
      }),
    }
  )
);
