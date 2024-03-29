import * as React from "react";
import { observer } from "mobx-react";
import GroupComparisonStore from "./GroupComparisonStore";
import { MolecularProfile } from "../../shared/api/generated/CBioPortalAPI";
import LoadingIndicator from "../../shared/components/loadingIndicator/LoadingIndicator";
import ErrorMessage from "../../shared/components/ErrorMessage";
import EnrichmentsDataSetDropdown from "../resultsView/enrichments/EnrichmentsDataSetDropdown";
import AlterationEnrichmentContainer from "../resultsView/enrichments/AlterationEnrichmentsContainer";
import autobind from "autobind-decorator";
import { MakeMobxView } from "../../shared/components/MobxView";
import { MakeEnrichmentsTabUI, getNumSamples } from "./GroupComparisonUtils";
import { remoteData } from "public-lib/api/remoteData";
import { ResultsViewPageStore } from "../resultsView/ResultsViewPageStore";
import _ from "lodash";
import { AlterationContainerType } from "pages/resultsView/enrichments/EnrichmentsUtil";

export interface IMutationEnrichmentsProps {
    store: GroupComparisonStore
}

@observer
export default class MutationEnrichments extends React.Component<IMutationEnrichmentsProps, {}> {

    @autobind
    private onChangeProfile(profileMap:{[studyId:string]:MolecularProfile}) {
        this.props.store.setMutationEnrichmentProfileMap(profileMap);
    }

    readonly tabUI = MakeEnrichmentsTabUI(()=>this.props.store, ()=>this.enrichmentsUI, "mutation", true, true, true);

    private readonly enrichmentAnalysisGroups = remoteData({
        await:()=>[this.props.store.activeGroups],
        invoke:()=>{
            const groups = _.map(this.props.store.activeGroups.result, group => {
                return {
                    name:group.nameWithOrdinal,
                    description:`Number (percentage) of ${this.props.store.usePatientLevelEnrichments ? "patients" : "samples"} in ${group.nameWithOrdinal} that have a mutation in the listed gene.`,
                    count: getNumSamples(group),
                    color: group.color
                }
            })
            return Promise.resolve(groups);
        }
    });

    readonly enrichmentsUI = MakeMobxView({
        await:()=>[
            this.props.store.mutationEnrichmentData,
            this.props.store.selectedStudyMutationEnrichmentProfileMap,
            this.enrichmentAnalysisGroups,
            this.props.store.studies
        ],
        render:()=>{
            let headerName = "Mutation";
            let studyIds = Object.keys(this.props.store.selectedStudyMutationEnrichmentProfileMap.result!);
            if (studyIds.length === 1) {
                headerName = this.props.store.selectedStudyMutationEnrichmentProfileMap.result![studyIds[0]].name
            }
            return (
                <div data-test="GroupComparisonMutationEnrichments">
                    <EnrichmentsDataSetDropdown
                        dataSets={this.props.store.mutationEnrichmentProfiles}
                        onChange={this.onChangeProfile}
                        selectedProfileByStudyId={this.props.store.selectedStudyMutationEnrichmentProfileMap.result!}
                        studies={this.props.store.studies.result!}
                    />
                    <AlterationEnrichmentContainer data={this.props.store.mutationEnrichmentData.result!}
                        groups={this.enrichmentAnalysisGroups.result}
                        alteredVsUnalteredMode={false}
                        headerName={headerName}
                        containerType={AlterationContainerType.MUTATION}
                        patientLevelEnrichments={this.props.store.usePatientLevelEnrichments}
                        onSetPatientLevelEnrichments={this.props.store.setUsePatientLevelEnrichments}
                    />
                </div>
            );
        },
        renderPending:()=><LoadingIndicator center={true} isLoading={true} size={"big"}/>,
        renderError:()=><ErrorMessage/>
    });

    render() {
        return this.tabUI.component;
    }
}
