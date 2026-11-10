var e=`# 장비

빌드 편집기의 **장비** 부분에는 무기와 방어구가 있어요. 오른쪽 라이브러리에서
무기와 보조 장비를 끌어오거나, 클릭해서 장착하세요. 방어구는 아래 설명처럼
인형에서 골라요.

## 무기 세트

**무기 세트**는 **네 개**까지 가지고 다닐 수 있어요. 각 세트는 무기 하나와, 무기가
한 손을 비워 두면 Shield나 Focus 같은 보조 장비 하나로 이루어져요. 세트 1로
시작하고, 나머지는 비워 둬도 돼요.

매치에서는 **1~4**(클래식 키에서는 **F1~F4**)로 세트를 바꿔요. 교체는 지금 하고
있는 시전이나 휘두르기가 끝날 때까지 기다려요. 이동하거나 Esc를 누르면 바로
바뀌어요. 쿨다운은 없어요. 공격, 특정 무기가 필요한 스킬, 최대 에너지는 모두 손에
든 세트를 따라가요.

무기는 그 속성이 랭크 9 이상이어야 해요. 그보다 낮으면 피해가 3분의 1만 들어가고,
편집기가 빨간색으로 알려 줘요. Sword는 항상 Swordsmanship이지만, Staff, Wand,
Shield, Focus는 내가 고르는 속성용으로 만들어져요. 인형에서 그 손(무기는 **6**,
보조 장비는 **7**)을 클릭하고 하나 고르세요.

## 무기 개조

모든 무기와 보조 장비에는 개조 슬롯이 있어요. **접두사**, **접미사**,
**각인**이에요. 인형의 손이나 그 옆의 줄을 클릭해서 고르세요. 각각 무슨 효과인지
나와요. Wand, Shield, Focus에는 접두사가 들어가지 않고, 맨손에는 아무것도 들어가지
않아요. 개조는 항상 최고 수치이고, 무기 세트마다 자기 개조를 달고 있어서 세트를
바꾸면 개조도 함께 바뀌어요. 최대 체력과 에너지는 손에 든 세트를 따라가요. 무기를
바꾸면 여전히 맞는 개조는 유지되고, 어떤 개조가 빠졌는지 알려 줘요.

| 개조                      | 슬롯   | 장착 가능                            | 효과                                      |
| ------------------------- | ------ | ------------------------------------ | ----------------------------------------- |
| Defensive                 | 접두사 | Staff                                | 방어력 +5                                 |
| Hale                      | 접두사 | Staff                                | 체력 +30                                  |
| Insightful                | 접두사 | Staff                                | 에너지 +5                                 |
| of Defense                | 접미사 | 모든 전투 무기, Staff                | 방어력 +5                                 |
| of Fortitude              | 접미사 | 모든 전투 무기, Staff, Shield, Focus | 체력 +30                                  |
| of Shelter                | 접미사 | 모든 전투 무기, Staff                | 방어력 +7 (물리 피해 상대)                |
| of Warding                | 접미사 | 모든 전투 무기, Staff                | 방어력 +7 (원소 피해 상대)                |
| "Cast Out the Unclean"    | 각인   | Shield, Focus                        | 나에게 걸린 Disease 지속 시간 20% 감소    |
| "Fear Cuts Deeper"        | 각인   | Shield, Focus                        | 나에게 걸린 Bleeding 지속 시간 20% 감소   |
| "I Can See Clearly Now"   | 각인   | Shield, Focus                        | 나에게 걸린 Blinded 지속 시간 20% 감소    |
| "I have the power!"       | 각인   | 모든 전투 무기                       | 에너지 +5                                 |
| "Leaf on the Wind"        | 각인   | Shield, Focus                        | 방어력 +10 (냉기 피해 상대)               |
| "Like a Rolling Stone"    | 각인   | Shield, Focus                        | 방어력 +10 (대지 피해 상대)               |
| "Live for Today"          | 각인   | Focus                                | 에너지 +15, 에너지 재생 -1                |
| "Not the face!"           | 각인   | Shield, Focus                        | 방어력 +10 (둔기 피해 상대)               |
| "Only the Strong Survive" | 각인   | Shield, Focus                        | 나에게 걸린 Weakness 지속 시간 20% 감소   |
| "Pure of Heart"           | 각인   | Shield, Focus                        | 나에게 걸린 Poison 지속 시간 20% 감소     |
| "Riders on the Storm"     | 각인   | Shield, Focus                        | 방어력 +10 (번개 피해 상대)               |
| "Seize the Day"           | 각인   | Staff, Wand                          | 에너지 +15, 에너지 재생 -1                |
| "Sleep Now in the Fire"   | 각인   | Shield, Focus                        | 방어력 +10 (화염 피해 상대)               |
| "Soundness of Mind"       | 각인   | Shield, Focus                        | 나에게 걸린 Dazed 지속 시간 20% 감소      |
| "Strength of Body"        | 각인   | Shield, Focus                        | 나에게 걸린 Deep Wound 지속 시간 20% 감소 |
| "Swift as the Wind"       | 각인   | Shield, Focus                        | 나에게 걸린 Crippled 지속 시간 20% 감소   |
| "The Riddle of Steel"     | 각인   | Shield, Focus                        | 방어력 +10 (참격 피해 상대)               |
| "Through Thick and Thin"  | 각인   | Shield, Focus                        | 방어력 +10 (관통 피해 상대)               |

### 적중 시 발동하는 전투 접두사

| 접두사                       | 장착 가능                  | 적중 시 효과                                            |
| ---------------------------- | -------------------------- | ------------------------------------------------------- |
| Vampiric                     | 모든 전투 무기             | 체력 3 흡수 (hammer, scythe, bows는 5), 체력 재생 -1    |
| Zealous                      | 모든 전투 무기             | 에너지 1 획득, 에너지 재생 -1                           |
| Sundering                    | 모든 전투 무기             | 20% 확률로 방어력 관통 +20%                             |
| Furious                      | 전투 무기, bows 제외       | 10% 확률로 아드레날린 2배                               |
| Barbed, Crippling, Poisonous | 전투 무기, hammer 제외     | 내가 거는 Bleeding, Crippled, Poison이 33% 더 오래 지속 |
| Cruel                        | 전투 무기, bows 제외       | 내가 거는 Deep Wound가 33% 더 오래 지속                 |
| Heavy                        | axe, hammer, scythe, spear | 내가 거는 Weakness가 33% 더 오래 지속                   |
| Silencing                    | daggers, spear, bows       | 내가 거는 Dazed가 33% 더 오래 지속                      |
| Ebon, Fiery, Icy, Shocking   | 모든 전투 무기             | 무기 피해가 대지, 화염, 냉기, 번개 피해로 바뀜          |

"적중 시"는 공격이나 공격 스킬이 실제로 적중한 경우를 말해요. 막히거나 빗나간
공격에는 아무 효과도 없어요. 더 오래 지속되는 상태이상은 공격 스킬이 거는
상태이상이에요.

### 내 상태에 따라 발동하는 개조

내 상태에 따라 발동하는 개조는 그 상태인 동안에만 적용돼요. "체력 절반 초과"와
"체력 절반 미만"은 엄격해서, 정확히 절반이면 둘 다 적용되지 않아요. 늘어났던 최대치가
끝나면 새 최대치를 넘는 체력이나 에너지는 사라져요.

| 개조                                               | 슬롯, 장착 가능              | 효과                                               |
| -------------------------------------------------- | ---------------------------- | -------------------------------------------------- |
| "Strength and Honor"                               | 각인, 전투 무기              | 체력 절반 초과일 때 무기 피해 +15%                 |
| "Guided by Fate", "Dance with Death"               | 각인, 전투 무기              | 인챈트 중일 때, 태세 중일 때 무기 피해 +15%        |
| "Too Much Information"                             | 각인, 전투 무기              | 저주에 걸린 적에게 무기 피해 +15%                  |
| "Vengeance is Mine"                                | 각인, 전투 무기              | 체력 절반 미만일 때 무기 피해 +20%                 |
| "Don't Fear the Reaper"                            | 각인, 전투 무기              | 저주에 걸렸을 때 무기 피해 +20%                    |
| "To the Pain!"                                     | 각인, 전투 무기              | 무기 피해 +15%, 공격하는 동안 방어력 -10           |
| "Brawn over Brains"                                | 각인, 전투 무기              | 무기 피해 +15%, 에너지 -5                          |
| "Hale and Hearty", "Have Faith"                    | 각인, 모든 무기              | 체력 절반 초과일 때, 인챈트 중일 때 에너지 +5      |
| "Don't call it a comeback!", "I am Sorrow."        | 각인, 모든 무기              | 체력 절반 미만일 때, 저주에 걸렸을 때 에너지 +7    |
| of Devotion, of Endurance                          | 접미사, staff, shield, focus | 인챈트 중일 때, 태세 중일 때 체력 +45              |
| of Valor                                           | 접미사, staff, shield, focus | 저주에 걸렸을 때 체력 +60                          |
| "Luck of the Draw"                                 | 각인, shield 또는 focus      | 20% 확률로 물리 공격 피해 5 감소                   |
| "Sheltered by Faith", "Run For Your Life!"         | 각인, shield 또는 focus      | 인챈트 중일 때, 태세 중일 때 물리 공격 피해 2 감소 |
| "Nothing to Fear"                                  | 각인, shield 또는 focus      | 저주에 걸렸을 때 물리 공격 피해 3 감소             |
| "Hail to the King", "Faith is My Shield"           | 각인, focus                  | 체력 절반 초과일 때, 인챈트 중일 때 방어력 +5      |
| "Might makes Right", "Knowing is Half the Battle." | 각인, focus                  | 공격하는 동안, 주문을 시전하는 동안 방어력 +5      |
| "Man for All Seasons", "Survival of the Fittest"   | 각인, focus                  | 원소 피해, 물리 피해에 대해 방어력 +5              |
| "Ignorance is Bliss", "Life is Pain"               | 각인, focus                  | 방어력 +5, 에너지 -5, 체력 -20                     |
| "Down But Not Out", "Be Just and Fear Not"         | 각인, focus                  | 체력 절반 미만일 때, 저주에 걸렸을 때 방어력 +10   |

무기 피해는 무기 자체의 피해 굴림이에요. 공격 스킬의 추가 피해는 늘어나지 않아요.

### 시전자 개조

시전자 개조는 주문에만 작용하고, 주문을 쓸 때마다 각자의 확률로 발동해요. "아이템의
속성"은 그 Staff, Wand, Focus가 만들어진 속성이에요. 반감 개조 두 개가 동시에
발동해도 한 번만 반감돼요.

| 개조                        | 슬롯, 장착 가능              | 효과                                           |
| --------------------------- | ---------------------------- | ---------------------------------------------- |
| Adept                       | 접두사, staff                | 20% 확률로 아이템 속성 주문의 시전 시간 반감   |
| Swift                       | 접두사, staff                | 10% 확률로 모든 주문의 시전 시간 반감          |
| of Aptitude                 | 접미사, focus                | 20% 확률로 아이템 속성 주문의 시전 시간 반감   |
| of Swiftness                | 접미사, focus                | 10% 확률로 모든 주문의 시전 시간 반감          |
| "Aptitude not Attitude"     | 각인, staff 또는 wand        | 20% 확률로 아이템 속성 주문의 시전 시간 반감   |
| "Don't think twice"         | 각인, staff 또는 wand        | 10% 확률로 모든 주문의 시전 시간 반감          |
| of Memory                   | 접미사, wand                 | 20% 확률로 아이템 속성 주문의 재충전 시간 반감 |
| of Quickening               | 접미사, wand                 | 10% 확률로 모든 주문의 재충전 시간 반감        |
| "Let the Memory Live Again" | 각인, staff 또는 wand        | 10% 확률로 모든 주문의 재충전 시간 반감        |
| "Forget Me Not"             | 각인, focus                  | 20% 확률로 아이템 속성 주문의 재충전 시간 반감 |
| "Serenity Now"              | 각인, focus                  | 10% 확률로 모든 주문의 재충전 시간 반감        |
| of Mastery                  | 접미사, staff                | 20% 확률로 주문 하나에 아이템 속성 +1          |
| "Master of My Domain"       | 각인, shield 또는 focus      | 20% 확률로 주문 하나에 아이템 속성 +1          |
| of Enchanting               | 접미사, 전투 무기 또는 staff | 내가 거는 인챈트가 20% 더 오래 지속            |

## 방어구

방어구는 머리 장비, 상의, 장갑, 하의, 신발의 다섯 부위예요. 모든 부위에 강화 슬롯이
두 개 있어요.

- **휘장**: 그 부위에 작은 보너스를 줘요. 예를 들어 물리 피해에 대한 방어력, 또는
  공격하는 동안의 방어력이요.
- **룬**.

**머리 장비**는 내가 고르는 속성 하나에 +1을 더해요.

편집기에서 방어구는 인형으로 나와요. 인형의 번호 붙은 부위나 그 옆의 줄을 클릭해서
휘장과 룬을 고르세요. 각 선택지가 그 부위에서 무슨 효과인지 나와요. **5개 전체에
휘장 적용**은 고른 휘장을 모든 부위에 달아요. 인형은 각 부위의 휘장과 룬을 보여
주고, 지금 보고 있는 세트의 무기를 개조와 함께 들고 있어요.

## 룬

| 룬                                     | 효과                                  |
| -------------------------------------- | ------------------------------------- |
| 하급 속성 룬                           | 속성 하나에 +1                        |
| 상급 속성 룬                           | 속성 하나에 +2, 체력 -35              |
| 최상급 속성 룬                         | 속성 하나에 +3, 체력 -75              |
| Vigor                                  | 체력 증가 (+30, +41, +50)             |
| Vitae                                  | 체력 +10                              |
| Attunement                             | 에너지 증가 (+3, +6, +9)              |
| Clarity, Purity, Recovery, Restoration | 상태이상 두 가지가 각각 20% 빨리 풀림 |
| Absorption (Warrior)                   | 공격마다 받는 물리 피해 감소          |

부위의 룬은 휘장과 같은 곳에서 골라요. 인형의 그 부위를 클릭하세요.

편집기가 모두 더해서 보여 줘요. 첫 번째 무기 세트 기준의 체력, 에너지, 방어력,
피해예요.
`;export{e as default};
//# sourceMappingURL=equipment-Cw3rocft.js.map