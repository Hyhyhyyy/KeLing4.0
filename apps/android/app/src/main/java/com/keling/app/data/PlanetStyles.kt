package com.keling.app.data

/** Index is the shared API identifier; never reorder these ten styles. */
data class PlanetStyle(val index: Int, val name: String, val asset: String) {
    val assetPath: String get() = "stellar/$asset.webp"
}

object PlanetStyles {
    val entries = listOf("翡翠书环", "珊瑚火山", "极光冰晶", "琥珀沙丘", "云海雷霆", "深海潮汐", "苔原花园", "紫晶洞窟", "机械星核", "银月陨坑")
        .mapIndexed { index, name -> PlanetStyle(index, name, "planet_${(index + 1).toString().padStart(2, '0')}") }
    fun requireIndex(index: Int) { require(index in entries.indices) { "请选择十款星球中的一种" } }
    fun name(index: Int): String = entries.getOrNull(index)?.name ?: "经典星球"

    /** Keep legacy indices 10..25 readable without rewriting stored courses. */
    fun assetPath(index: Int, courseId: String = ""): String {
        if (index < 0) return entries[Math.floorMod(courseId.hashCode(), entries.size)].assetPath
        return entries.getOrNull(index)?.assetPath ?: legacyAssets.getOrNull(index) ?: entries.first().assetPath
    }
    private val legacyAssets = listOf(
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_07a20814018bed149e242871aa99cd10-faf0ff4f-e6fb-4d94-8384-dcbb07597090.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_0993b3eedeb68e3f1d013696dcd4ab95-133b2cd8-8881-4441-badb-9d993cf37dda.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_0b4b056395ccefcffe8e3593d2aaf993-8c429fb1-8f83-4e6c-9bc4-de6f21a18280.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_0e8f63059a67276753d02d05dc97c158-0b75cc75-ffc4-42d5-ac76-6de673dca899.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_0e8f63059a67276753d02d05dc97c158-6af0600b-3f39-48b6-ba11-615f8183cad6.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_16d9ebb7872c669e3bd5637e28a35a65-6c1877b7-a932-410a-8c61-44c40e617439.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_307b4a6a95817b450c7e945ce37d228b-48bf7838-1021-4fbe-bf69-4bd71a07b437.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_31b946b3ead010641244b6b7176c5ecb-1a24aad9-738e-4c70-81a2-99ecd163bce3.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_3a1fd122a8aab30c419db474d6e444d6-f2e03783-b936-4576-b5b3-9edd632aa12c.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_41fd91827d19f6f46417005300fa0809-6874d173-cd3f-4f9b-8eb6-42f94793779c.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_6032a41fb1565066336cd62a2a926045-3fb40176-487e-47f3-a4ea-41112b8816c9.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_70bf74b24efad13cc71e49e203fa8055-1721dc18-b433-440b-9233-d529652a484a.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_8f0ee1d0710ed6c6ed8f66b661b1a959-27d4bcf7-aff6-4edc-96ed-2099af867368.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_90d9936af5b4dc30de0696ae693bea5a-e48ee654-8c15-4280-8e6e-c558d3af1fcb.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_95d8fab3e680a70a7ec3e2ca5ee13bec-36b7becc-ff31-4236-b3cc-462c3eb01f3f.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_9de3180455383e811e245cd59fa5020a-b4217c91-ba74-41d2-a0f6-2c46d60385fe.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_aa577092503bea91703ba9f92c12d4ab-8d9f0ceb-961b-4680-8717-24041458cce9.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_b022f3718a9eea140918367b877cb70f-8ad7301d-b4f0-4965-a3d7-63fbeceae6c3.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_b5206486e496772663bd3b6978ca55db-5f32461e-63d4-4644-9110-eb824ccee506.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_b6fdd250d86d7b97f287a0b5a4fde16c-44faad32-f426-457b-8af3-e2061a40963f.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_d553cc07f9bb7cbac6562301b14ff8ff-da9e8789-960f-413b-8186-37aab671ff2c.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_d8165f6c0f4f770a2c33befb2510f19f-5579b4d1-158f-4bc1-ba3d-8eb4fbe1fd8e.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_d890ca4506f6940539db56c09b68551c-412232ae-0478-425f-8970-f7cd7c12259d.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_e9e8aaa3200e859adfea10472df644c0-56ee0a64-7813-4701-87cb-9c8dab7f8a8e.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_f4cb5609faae9ead6993f1b081d56a87-36b5efb0-dcb7-4733-bdf1-ad66833f72aa.png",
    "c__Users_13581_AppData_Roaming_Cursor_User_workspaceStorage_e1c746f1359e04a44268afce37572912_images_fe8cd156e1e20a602fffd498ead499e4-c3c369de-574c-4942-a792-223bd688e297.png"
    )
}
