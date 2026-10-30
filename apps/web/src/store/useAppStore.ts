import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Course, Task, Note } from '../types';
import { authAPI, courseAPI, taskAPI, noteAPI } from '../services/api';
import { startGuestSession, endGuestSession, getGuestSessionId } from '../services/guestSession';
import { clearModelAccess } from '../services/modelAccess';
import { readExpeditionIdentity, rememberExpeditionIdentity } from '../services/expeditionStorage';

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

  // 数据状态
  courses: Course[];
  tasks: Task[];
  notes: Note[];

  // UI 状态
  currentScreen: string;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
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

      // 登录
      login: async (email, password) => {
        try {
          const { data } = await authAPI.login({ email, password });
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
            isGuest: false,
            isLoading: false,
          });
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '登录失败');
        }
      },

      // 注册
      register: async (name, email, password) => {
        try {
          const { data } = await authAPI.register({ name, email, password });
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
            isGuest: false,
            isLoading: false,
          });
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '注册失败');
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
          courses: [], tasks: [], notes: [], isLoading: true });
        await get().loadUser();
      },
      endGuest: () => {
        endGuestSession();
        clearModelAccess();
        // The visitor never replaces or removes an existing account credential.
        set({ isGuest: false, isAuthenticated: false, offlineAccount: false, user: null, authError: null,
          token: localStorage.getItem('token'), courses: [], tasks: [], notes: [], isLoading: false });
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
          set({user:data.user,token,isAuthenticated:true,isLoading:false,offlineAccount:false});
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
        const session=workspaceIdentity();
        try {
          const { data } = await courseAPI.getAll();
          if(session===workspaceIdentity())set({ courses: data.courses || [] });
        } catch (error) {
          console.error('加载课程失败:', error);
        }
      },

      // 加载任务
      loadTasks: async () => {
        const session=workspaceIdentity();
        try {
          const { data } = await taskAPI.getAll();
          if(session===workspaceIdentity())set({ tasks: data.tasks || [] });
        } catch (error) {
          console.error('加载任务失败:', error);
        }
      },

      // 加载笔记
      loadNotes: async () => {
        const session=workspaceIdentity();
        try {
          const { data } = await noteAPI.getAll();
          if(session===workspaceIdentity())set({ notes: data.notes || [] });
        } catch (error) {
          console.error('加载笔记失败:', error);
        }
      },

      // 创建课程
      createCourse: async (data) => {
        try {
          await courseAPI.create(data);
          await get().loadCourses();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '创建课程失败');
        }
      },

      // 更新课程
      updateCourse: async (id, data) => {
        try {
          await courseAPI.update(id, data);
          await get().loadCourses();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '更新课程失败');
        }
      },

      // 删除课程
      deleteCourse: async (id) => {
        try {
          await courseAPI.delete(id);
          await get().loadCourses();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '删除课程失败');
        }
      },

      // 创建任务
      createTask: async (data) => {
        try {
          await taskAPI.create(data);
          await get().loadTasks();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '创建任务失败');
        }
      },

      // 更新任务
      updateTask: async (id, data) => {
        try {
          await taskAPI.update(id, data);
          await get().loadTasks();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '更新任务失败');
        }
      },

      // 完成任务
      completeTask: async (id, actualMinutes) => {
        const session = workspaceIdentity();
        try {
          await taskAPI.complete(id, { actualMinutes });

          // Fetch authoritative levels and minutes, including changes from another device.
            const profile = await authAPI.getMe();
            if (workspaceIdentity() !== session) return;
            set({user:profile.data.user});
            await get().loadTasks();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '完成任务失败');
        }
      },

      // 删除任务
      deleteTask: async (id) => {
        try {
          await taskAPI.delete(id);
          await get().loadTasks();
        } catch (error: any) {
          throw new Error(error.response?.data?.error || '删除任务失败');
        }
      },

      // 创建笔记
      createNote: async (data) => {
        try {
          await noteAPI.create(data);
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
