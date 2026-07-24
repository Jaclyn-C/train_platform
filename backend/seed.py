"""Seed the database with default users and projects for development."""

import asyncio
from sqlalchemy import select
from app.core.database import async_session
from app.core.security import hash_password
from app.models.user import User
from app.models.project import Project
from app.models.team import Team
from app.models.team_member import TeamMember

DEFAULT_USERS = [
    {
        "username": "admin",
        "email": "admin@example.com",
        "name": "管理员",
        "password": "123456",
        "role": "admin",
        "avatar": "管",
    },
    {
        "username": "zhangsan",
        "email": "zhangsan@example.com",
        "name": "张三",
        "password": "123456",
        "role": "engineer",
        "avatar": "张",
    },
    {
        "username": "lisi",
        "email": "lisi@example.com",
        "name": "李四",
        "password": "123456",
        "role": "annotator",
        "avatar": "李",
    },
    {
        "username": "wangwu",
        "email": "wangwu@example.com",
        "name": "王五",
        "password": "123456",
        "role": "engineer",
        "avatar": "王",
    },
    {
        "username": "zhaoliu",
        "email": "zhaoliu@example.com",
        "name": "赵六",
        "password": "123456",
        "role": "annotator",
        "avatar": "赵",
    },
    {
        "username": "sunqi",
        "email": "sunqi@example.com",
        "name": "孙七",
        "password": "123456",
        "role": "engineer",
        "avatar": "孙",
    },
    {
        "username": "zhouba",
        "email": "zhouba@example.com",
        "name": "周八",
        "password": "123456",
        "role": "annotator",
        "avatar": "周",
    },
    {
        "username": "qianjiu",
        "email": "qianjiu@example.com",
        "name": "钱九",
        "password": "123456",
        "role": "customer",
        "avatar": "钱",
    },
]


async def seed():
    async with async_session() as db:
        for user_data in DEFAULT_USERS:
            # Check if user already exists
            result = await db.execute(
                select(User).where(User.username == user_data["username"])
            )
            if result.scalar_one_or_none():
                print(f"  skip: {user_data['username']} already exists")
                continue

            user = User(
                username=user_data["username"],
                email=user_data["email"],
                name=user_data["name"],
                password_hash=hash_password(user_data.pop("password")),
                role=user_data["role"],
                avatar=user_data["avatar"],
            )
            # Put password back for logging
            user_data["password"] = "123456"
            db.add(user)
            print(f"  created: {user_data['username']} ({user_data['role']})")

        await db.commit()

        # ── Teams ──
        teams_data = [
            {"id": 1, "name": "安保检测组", "owner_id": 1},
            {"id": 2, "name": "消防安全组", "owner_id": 2},
            {"id": 3, "name": "默认团队", "owner_id": 1},
        ]
        for td in teams_data:
            result = await db.execute(select(Team).where(Team.id == td["id"]))
            if result.scalar_one_or_none():
                continue
            db.add(Team(**td))
        await db.commit()
        print("  teams seeded")

        # ── Projects ──
        projects_data = [
            {"name": "保安服检测", "park": "ganzhou", "task_type": "detection",
             "is_personal": False, "created_by": 1, "team_id": 1},
            {"name": "烟火检测", "park": "ganzhou", "task_type": "detection",
             "is_personal": False, "created_by": 2, "team_id": 2},
            {"name": "安全帽检测", "park": "vietnam", "task_type": "detection",
             "is_personal": False, "created_by": 1, "team_id": 3},
            {"name": "车辆识别", "park": "ganzhou", "task_type": "detection",
             "is_personal": True, "created_by": 1},
            {"name": "行人检测", "park": "vietnam", "task_type": "detection",
             "is_personal": True, "created_by": 2},
        ]
        for pd in projects_data:
            result = await db.execute(
                select(Project).where(Project.name == pd["name"])
            )
            if result.scalar_one_or_none():
                continue
            db.add(Project(**pd))
        await db.commit()
        print("  projects seeded")

    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
